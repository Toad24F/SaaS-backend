import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { validarFechaLocal } from '../horarios/calendario';
import { HorarioPersonal } from '../horarios/entities/horario-personal.entity';
import { Sucursal } from '../sucursales/entities/sucursal.entity';
import type { ContextoCalculoDisponibilidad } from './contexto-disponibilidad.service';
import { BloqueosAplicablesService } from './bloqueos-aplicables.service';
import { proyectarAtencion, type ExcepcionFuente,
  type FranjaSemanalFuente, type ProyeccionAtencion } from './proyeccion-atencion';

/** Proyecta horarios con el contexto autorizado, sin transacciones ni repositorios propios. */
@Injectable()
export class AtencionInternaService {
  constructor(private readonly bloqueos: BloqueosAplicablesService) {}

  async consultar(contexto: ContextoCalculoDisponibilidad, sucursalId: number,
    desde: string, hasta: string): Promise<ProyeccionAtencion> {
    if (!contexto.manager.queryRunner?.isTransactionActive) {
      throw new Error('La lectura de atención requiere una transacción activa.');
    }
    validarFechaLocal(desde);
    validarFechaLocal(hasta);
    const inicio = Date.parse(`${desde}T00:00:00.000Z`);
    const fin = Date.parse(`${hasta}T00:00:00.000Z`);
    if (fin < inicio || (fin - inicio) / 86400000 >= 31 ||
      !Number.isSafeInteger(sucursalId) || sucursalId <= 0) {
      throw new BadRequestException('Rango o sucursal de atención inválidos.');
    }
    const { manager, negocioId, personalId } = contexto;
    const sede = await manager.getRepository(Sucursal).findOneBy({ id: sucursalId, negocioId });
    if (!sede) throw new NotFoundException('Sucursal no disponible.');
    // No se filtra el estado de la sede: el cálculo de citas afectadas necesitará verlo.
    const semana = await manager.getRepository(HorarioPersonal).findBy({
      negocioId, personalId, activo: true, sucursalId });
    // La cabecera llega aun sin hijas; DATE_FORMAT evita el desfase de DATE del driver.
    const excepciones: Array<{ sucursalId: number; fechaLocal: string;
      id: number | null; inicioMinutos: number | null; finMinutos: number | null;
      descansoInicioMinutos: number | null; descansoFinMinutos: number | null }> =
      await manager.query(`SELECT e.sucursal_id sucursalId,
        DATE_FORMAT(e.fecha_local, '%Y-%m-%d') fechaLocal, f.id id,
        f.inicio_minutos inicioMinutos, f.fin_minutos finMinutos,
        f.descanso_inicio_minutos descansoInicioMinutos,
        f.descanso_fin_minutos descansoFinMinutos
        FROM excepciones_horario e LEFT JOIN franjas_excepcion_horario f
          ON f.negocio_id=e.negocio_id AND f.excepcion_id=e.id
        WHERE e.negocio_id=? AND e.personal_id=? AND e.sucursal_id=?
          AND e.fecha_local BETWEEN ? AND ? ORDER BY e.fecha_local,f.orden,f.id`,
      [negocioId, personalId, sucursalId, desde, hasta]);
    const fuentesSemana: FranjaSemanalFuente[] = semana.map((fila) => {
      if (fila.inicioMinutos === null || fila.finMinutos === null || fila.sucursalId === null) {
        throw new Error('Horario activo incompleto.');
      }
      return { id: fila.id, sucursalId: fila.sucursalId, diaSemana: fila.diaSemana,
        inicioMinutos: fila.inicioMinutos, finMinutos: fila.finMinutos,
        descansoInicioMinutos: fila.descansoInicioMinutos,
        descansoFinMinutos: fila.descansoFinMinutos };
    });
    const porFecha = new Map<string, ExcepcionFuente>();
    for (const fila of excepciones) {
      let fuente = porFecha.get(fila.fechaLocal);
      if (!fuente) {
        fuente = { sucursalId: fila.sucursalId, fechaLocal: fila.fechaLocal, franjas: [] };
        porFecha.set(fila.fechaLocal, fuente);
      }
      if (fila.id !== null) fuente.franjas.push({ id: fila.id,
        inicioMinutos: fila.inicioMinutos!, finMinutos: fila.finMinutos!,
        descansoInicioMinutos: fila.descansoInicioMinutos,
        descansoFinMinutos: fila.descansoFinMinutos });
    }
    const fuentesExcepcion = [...porFecha.values()];
    const restricciones = await this.bloqueos.consultar(contexto, sucursalId,
      desde, hasta, sede.zonaHoraria);
    const resultado: ProyeccionAtencion = { bloques: [], tramos: [], descansos: [], omisiones: [] };
    // La fecha es civil de la sucursal; solo los extremos se comparan en UTC.
    for (let dia = inicio; dia <= fin; dia += 86400000) {
      const fechaLocal = new Date(dia).toISOString().slice(0, 10);
      const diario = proyectarAtencion(fechaLocal, sucursalId, sede.zonaHoraria,
        fuentesSemana, fuentesExcepcion, restricciones);
      resultado.bloques.push(...diario.bloques);
      resultado.tramos.push(...diario.tramos);
      resultado.descansos.push(...diario.descansos);
      resultado.omisiones.push(...diario.omisiones);
    }
    return resultado;
  }
}
