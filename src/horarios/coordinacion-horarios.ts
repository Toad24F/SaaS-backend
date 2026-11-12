import { ConflictException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { In } from 'typeorm';
import { Personal } from '../profesionales/entities/personal.entity';
import { PersonalSucursal } from '../profesionales/entities/personal-sucursal.entity';
import { Sucursal } from '../sucursales/entities/sucursal.entity';
import { validarRecurrencias } from './calendario';
import { HorarioPersonal } from './entities/horario-personal.entity';
import { exigirHorarioTransicionado } from './transicion-horarios';

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
      await exigirHorarioTransicionado(manager, negocioId, personalId);
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
      const conflicto = validarRecurrencias(semana, [], zonas, desde);
      if (conflicto) {
        const referencias = conflicto.filas.map((indice) => `franja ${semana[indice].id}`);
        throw new ConflictException(`Profesional ${personalId}: empalme entre filas ${
          conflicto.filas.join(' y ')} (${referencias.join(' y ')}), inicioMinutos.`);
      }
    }
  }
}
