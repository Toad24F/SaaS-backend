import { Injectable } from '@nestjs/common';
import { BloqueoTemporal } from './entities/bloqueo-temporal.entity';
import { Cita } from './entities/cita.entity';
import type { ContextoCalculoDisponibilidad } from './contexto-disponibilidad.service';
import type { Ocupacion } from './contratos-internos';

/** Compara intervalos UTC semiabiertos: tocar un extremo no es empalme. */
export function ocupacionesQueSeEmpalman(ocupaciones: readonly Ocupacion[],
  inicioUtc: Date, finUtc: Date): Ocupacion[] {
  return ocupaciones.filter((ocupacion) =>
    ocupacion.inicioUtc < finUtc && ocupacion.finUtc > inicioUtc);
}

/** Lee las dos fuentes persistidas sin restringir sucursal, servicio ni fecha local. */
@Injectable()
export class OcupacionesService {
  async consultar(contexto: ContextoCalculoDisponibilidad, desdeUtc: Date,
    hastaUtc: Date): Promise<Ocupacion[]> {
    const { manager, negocioId, personalId, ahora } = contexto;
    if (!manager.queryRunner?.isTransactionActive) {
      throw new Error('La lectura de ocupaciones requiere una transacción activa.');
    }
    if (!(desdeUtc instanceof Date) || !(hastaUtc instanceof Date) ||
      !Number.isFinite(desdeUtc.getTime()) || !Number.isFinite(hastaUtc.getTime()) ||
      desdeUtc >= hastaUtc || !Number.isFinite(ahora.getTime())) {
      throw new Error('Intervalo o instante de ocupaciones inválido.');
    }

    // Una cita que empezó antes del rango aún ocupa si termina dentro de él.
    // Se proyectan solo campos operativos: no se cargan clientes ni titulares.
    const citas = await manager.getRepository(Cita).createQueryBuilder('c')
      .select(['c.id', 'c.negocioId', 'c.personalId', 'c.sucursalId',
        'c.servicioId', 'c.inicioUtc', 'c.finUtc', 'c.estado'])
      .where('c.negocioId = :negocioId AND c.personalId = :personalId',
        { negocioId, personalId })
      .andWhere('c.estado <> :cancelada', { cancelada: 'cancelada' })
      .andWhere('c.inicioUtc < :hastaUtc AND c.finUtc > :desdeUtc',
        { desdeUtc, hastaUtc })
      .getMany();

    // La vigencia se decide con el instante capturado, sin esperar limpieza física.
    const apartados = await manager.getRepository(BloqueoTemporal)
      .createQueryBuilder('a')
      .select(['a.id', 'a.negocioId', 'a.personalId', 'a.sucursalId',
        'a.servicioId', 'a.inicioUtc', 'a.finUtc', 'a.expiraEn', 'a.liberadoEn'])
      .where('a.negocioId = :negocioId AND a.personalId = :personalId',
        { negocioId, personalId })
      .andWhere('a.liberadoEn IS NULL AND a.expiraEn > :ahora', { ahora })
      .andWhere('a.inicioUtc < :hastaUtc AND a.finUtc > :desdeUtc',
        { desdeUtc, hastaUtc })
      .getMany();

    const resultado: Ocupacion[] = [
      ...citas.map((cita) => ({ tipo: 'cita' as const, id: cita.id,
        negocioId: cita.negocioId, personalId: cita.personalId,
        sucursalId: cita.sucursalId, servicioId: cita.servicioId,
        inicioUtc: cita.inicioUtc, finUtc: cita.finUtc, estado: cita.estado })),
      ...apartados.map((apartado) => ({ tipo: 'apartado' as const,
        id: apartado.id, negocioId: apartado.negocioId,
        personalId: apartado.personalId, sucursalId: apartado.sucursalId,
        servicioId: apartado.servicioId, inicioUtc: apartado.inicioUtc,
        finUtc: apartado.finUtc, expiraEn: apartado.expiraEn,
        liberadoEn: apartado.liberadoEn })),
    ];
    return resultado.sort((a, b) => a.inicioUtc.getTime() - b.inicioUtc.getTime()
      || a.finUtc.getTime() - b.finUtc.getTime()
      || a.tipo.localeCompare(b.tipo) || a.id - b.id);
  }
}
