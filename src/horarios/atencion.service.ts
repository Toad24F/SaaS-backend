import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { BloqueosService } from '../bloqueos/bloqueos.service';
import { intervaloBloqueo, restarRestricciones } from '../bloqueos/calculo-bloqueos';
import { validarFechaLocal, resolverIntervaloLocal } from './calendario';
import { HorarioPersonal } from './entities/horario-personal.entity';
import { PersonalSucursal } from '../profesionales/entities/personal-sucursal.entity';
import { Sucursal } from '../sucursales/entities/sucursal.entity';
import { seleccionarFranjas, type FranjaSemanalFuente } from '../disponibilidad/proyeccion-atencion';
import { exigirHorarioTransicionado } from './transicion-horarios';

/** Proyecta atención semanal y bloqueos sin alterar filas persistidas. */
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
    await exigirHorarioTransicionado(manager, negocioId, personalId);
    const asignaciones = await manager.getRepository(PersonalSucursal).findBy({ negocioId, personalId });
    const ids = asignaciones.map((fila) => fila.sucursalId);
    const sedes = ids.length ? await manager.getRepository(Sucursal).findBy({
      negocioId, id: In(ids), activo: true }) : [];
    const semana = await this.horarios.findBy({ negocioId, personalId, activo: true });
    const fuentesSemana: FranjaSemanalFuente[] = semana.filter((fila) =>
      fila.sucursalId !== null && fila.inicioMinutos !== null && fila.finMinutos !== null)
      .map((fila) => ({ id: fila.id, sucursalId: fila.sucursalId!,
        diaSemana: fila.diaSemana, inicioMinutos: fila.inicioMinutos!,
        finMinutos: fila.finMinutos!, descansoInicioMinutos: fila.descansoInicioMinutos,
        descansoFinMinutos: fila.descansoFinMinutos }));
    const bloques = await this.bloqueos.listarParaAtencion(actorId, negocioId,
      personalId, desde, hasta);
    const intervalos: { fecha: string; sucursalId: number; inicioMinutos: number;
      finMinutos: number; inicioUtc: string; finUtc: string }[] = [];
    const omisiones: { fecha: string; sucursalId: number; motivo: string }[] = [];
    for (let dia = inicio; dia <= fin; dia += 86400000) {
      const fecha = new Date(dia).toISOString().slice(0, 10);
      for (const sede of sedes) {
        // Los huecos entre franjas permanecen porque se proyecta la semana canónica.
        const franjas = seleccionarFranjas(fecha, sede.id, fuentesSemana, []);
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
          for (const tramo of restarRestricciones([jornada], restricciones)) {
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
