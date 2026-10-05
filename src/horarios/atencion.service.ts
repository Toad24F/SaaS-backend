import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { BloqueosService } from '../bloqueos/bloqueos.service';
import { intervaloBloqueo, restarRestricciones, type Intervalo } from '../bloqueos/calculo-bloqueos';
import { validarFechaLocal, resolverIntervaloLocal } from './calendario';
import { HorarioPersonal } from './entities/horario-personal.entity';
import { PersonalSucursal } from '../profesionales/entities/personal-sucursal.entity';
import { Sucursal } from '../sucursales/entities/sucursal.entity';

interface FranjaFecha {
  inicioMinutos: number; finMinutos: number;
  descansoInicioMinutos: number | null; descansoFinMinutos: number | null;
}
interface FilaExcepcion extends FranjaFecha { fecha: string; sucursalId: number; id: number | null }

/** Proyecta atención efectiva sin alterar semana, excepción ni bloques persistidos. */
@Injectable()
export class AtencionService {
  constructor(@InjectRepository(HorarioPersonal) private readonly horarios: Repository<HorarioPersonal>,
    private readonly bloqueos: BloqueosService) {}

  async consultar(actorId: number, negocioId: number, personalId: number,
    desde: string, hasta: string) {
    validarFechaLocal(desde); validarFechaLocal(hasta);
    const inicio = Date.parse(`${desde}T00:00:00Z`);
    const fin = Date.parse(`${hasta}T00:00:00Z`);
    if (fin < inicio || (fin - inicio) / 86400000 > 366) {
      throw new BadRequestException('desde/hasta: rango inválido o demasiado extenso.');
    }
    const manager = this.horarios.manager;
    const asignaciones = await manager.getRepository(PersonalSucursal).findBy({ negocioId, personalId });
    const ids = asignaciones.map((fila) => fila.sucursalId);
    const sedes = ids.length ? await manager.getRepository(Sucursal).findBy({
      negocioId, id: In(ids), activo: true }) : [];
    const semana = await this.horarios.findBy({ negocioId, personalId, activo: true });
    const excepciones: FilaExcepcion[] = await manager.query(`SELECT e.sucursal_id sucursalId,
      DATE_FORMAT(e.fecha_local, '%Y-%m-%d') fecha, f.id id,
      f.inicio_minutos inicioMinutos, f.fin_minutos finMinutos,
      f.descanso_inicio_minutos descansoInicioMinutos,
      f.descanso_fin_minutos descansoFinMinutos
      FROM excepciones_horario e LEFT JOIN franjas_excepcion_horario f
        ON f.negocio_id = e.negocio_id AND f.excepcion_id = e.id
      WHERE e.negocio_id = ? AND e.personal_id = ? AND e.fecha_local BETWEEN ? AND ?`,
    [negocioId, personalId, desde, hasta]);
    const porFecha = new Map<string, FranjaFecha[]>();
    for (const fila of excepciones) {
      const clave = `${fila.fecha}:${fila.sucursalId}`;
      if (!porFecha.has(clave)) porFecha.set(clave, []);
      if (fila.id !== null) porFecha.get(clave)!.push(fila);
    }
    const bloques = (await this.bloqueos.listar(actorId)).filter((fila) =>
      (fila.personalId === null || fila.personalId === personalId) &&
      fila.fechaInicio <= hasta && fila.fechaFin >= desde);
    const intervalos: { fecha: string; sucursalId: number; inicioMinutos: number;
      finMinutos: number; inicioUtc: string; finUtc: string }[] = [];
    const omisiones: { fecha: string; sucursalId: number; motivo: string }[] = [];
    for (let dia = inicio; dia <= fin; dia += 86400000) {
      const fecha = new Date(dia).toISOString().slice(0, 10);
      const diaSemana = new Date(dia).getUTCDay();
      for (const sede of sedes) {
        const clave = `${fecha}:${sede.id}`;
        const franjas: FranjaFecha[] = porFecha.has(clave) ? porFecha.get(clave)! :
          semana.filter((fila) => fila.sucursalId === sede.id && fila.diaSemana === diaSemana)
            .map((fila) => fila as FranjaFecha);
        const restricciones = bloques.filter((fila) => fila.sucursalId === null ||
          fila.sucursalId === sede.id).map((fila) => intervaloBloqueo(fila, sede.zonaHoraria));
        for (const franja of franjas) {
          const jornada = resolverIntervaloLocal(fecha, sede.zonaHoraria,
            franja.inicioMinutos, franja.finMinutos, 'recurrencia');
          if (!jornada) {
            omisiones.push({ fecha, sucursalId: sede.id,
              motivo: 'Hora local inexistente o repetida.' });
            continue;
          }
          let tramos: Intervalo[] = [jornada];
          if (franja.descansoInicioMinutos !== null && franja.descansoFinMinutos !== null) {
            const descanso = resolverIntervaloLocal(fecha, sede.zonaHoraria,
              franja.descansoInicioMinutos, franja.descansoFinMinutos, 'recurrencia');
            if (!descanso) {
              omisiones.push({ fecha, sucursalId: sede.id, motivo: 'Descanso local inválido.' });
              continue;
            }
            tramos = restarRestricciones(tramos, [descanso]);
          }
          for (const tramo of restarRestricciones(tramos, restricciones)) {
            intervalos.push({ fecha, sucursalId: sede.id,
              inicioMinutos: this.minutoLocal(tramo.inicio, sede.zonaHoraria, fecha),
              finMinutos: this.minutoLocal(tramo.fin, sede.zonaHoraria, fecha),
              inicioUtc: tramo.inicio.toISOString(), finUtc: tramo.fin.toISOString() });
          }
        }
      }
    }
    intervalos.sort((a, b) => a.inicioUtc.localeCompare(b.inicioUtc) ||
      a.sucursalId - b.sucursalId);
    return { desde, hasta, personalId, intervalos, omisiones };
  }

  private minutoLocal(instante: Date, zona: string, fecha: string): number {
    const partes = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: zona,
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit',
      minute: '2-digit', hourCycle: 'h23' }).formatToParts(instante)
      .filter((x) => x.type !== 'literal').map((x) => [x.type, Number(x.value)]));
    const civil = `${partes.year}-${String(partes.month).padStart(2, '0')}-${String(partes.day).padStart(2, '0')}`;
    return civil > fecha ? 1440 : partes.hour * 60 + partes.minute;
  }
}
