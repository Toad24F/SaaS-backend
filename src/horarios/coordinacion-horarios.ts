import { ConflictException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { In } from 'typeorm';
import { Personal } from '../profesionales/entities/personal.entity';
import { PersonalSucursal } from '../profesionales/entities/personal-sucursal.entity';
import { Sucursal } from '../sucursales/entities/sucursal.entity';
import { validarRecurrencias, type ExcepcionCalendario } from './calendario';
import { HorarioPersonal } from './entities/horario-personal.entity';

interface FilaSql {
  id: number; sucursal_id: number; fecha_local: string;
  inicio_minutos: number | null; fin_minutos: number | null;
}

/** Revalida horarios de todos los perfiles afectados bajo el orden de ID estable. */
export class CoordinacionHorarios {
  async perfilesAsignados(manager: EntityManager, negocioId: number,
    sucursalId: number): Promise<number[]> {
    const relaciones = await manager.getRepository(PersonalSucursal).findBy({
      negocioId, sucursalId });
    return relaciones.map((r) => r.personalId).sort((a, b) => a - b);
  }

  async bloquearPerfiles(manager: EntityManager, negocioId: number,
    ids: number[]): Promise<void> {
    // Un lock por perfil, siempre ascendente, evita ciclos entre reactivaciones.
    for (const id of [...new Set(ids)].sort((a, b) => a - b)) {
      await manager.getRepository(Personal).createQueryBuilder('perfil')
        .setLock('pessimistic_write')
        .where('perfil.id = :id AND perfil.negocioId = :negocioId',
          { id, negocioId }).getOneOrFail();
    }
  }

  async validarPerfiles(manager: EntityManager, negocioId: number, ids: number[],
    desde: string, cambio?: { sucursalId: number; zonaHoraria?: string; activo?: boolean }) {
    for (const personalId of [...new Set(ids)].sort((a, b) => a - b)) {
      const relaciones = await manager.getRepository(PersonalSucursal).findBy({
        negocioId, personalId });
      const sucursalIds = relaciones.map((r) => r.sucursalId);
      const sucursales = sucursalIds.length ? await manager.getRepository(Sucursal).findBy({
        negocioId, id: In(sucursalIds) }) : [];
      const zonas = new Map<number, string>();
      for (const sucursal of sucursales) {
        const activa = cambio?.sucursalId === sucursal.id && cambio.activo !== undefined
          ? cambio.activo : sucursal.activo;
        if (activa) zonas.set(sucursal.id,
          cambio?.sucursalId === sucursal.id && cambio.zonaHoraria
            ? cambio.zonaHoraria : sucursal.zonaHoraria);
      }
      const existentes = await manager.getRepository(HorarioPersonal).findBy({
        negocioId, personalId, activo: true });
      const semana = existentes.filter((f) => f.sucursalId !== null &&
        zonas.has(f.sucursalId));
      // DATE_FORMAT preserva la fecha civil de MariaDB incluso si el driver
      // convierte las entidades DATE con el huso del proceso.
      const filas = await manager.query(`SELECT e.id, e.sucursal_id,
        DATE_FORMAT(e.fecha_local, '%Y-%m-%d') fecha_local,
        f.inicio_minutos, f.fin_minutos
        FROM excepciones_horario e LEFT JOIN franjas_excepcion_horario f
          ON f.negocio_id = e.negocio_id AND f.excepcion_id = e.id
        WHERE e.negocio_id = ? AND e.personal_id = ?`,
      [negocioId, personalId]) as FilaSql[];
      const porId = new Map<number, ExcepcionCalendario>();
      for (const fila of filas) {
        if (!zonas.has(Number(fila.sucursal_id))) continue;
        let excepcion = porId.get(Number(fila.id));
        if (!excepcion) {
          excepcion = { sucursalId: Number(fila.sucursal_id),
            fechaLocal: fila.fecha_local, franjas: [] };
          porId.set(Number(fila.id), excepcion);
        }
        if (fila.inicio_minutos !== null) excepcion.franjas.push({
          inicioMinutos: Number(fila.inicio_minutos),
          finMinutos: Number(fila.fin_minutos) });
      }
      const conflicto = validarRecurrencias(semana, [...porId.values()], zonas, desde);
      if (conflicto) {
        const referencias = conflicto.filas.map((indice) => indice < semana.length
          ? `franja ${semana[indice].id}` : `excepción ${[...porId.keys()][indice - semana.length]}`);
        throw new ConflictException(`Profesional ${personalId}: empalme entre filas ${
          conflicto.filas.join(' y ')} (${referencias.join(' y ')}), inicioMinutos.`);
      }
    }
  }
}
