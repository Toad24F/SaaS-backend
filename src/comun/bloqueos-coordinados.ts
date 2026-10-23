import { NotFoundException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { Negocio } from '../negocios/entities/negocio.entity';
import { Sucursal } from '../sucursales/entities/sucursal.entity';
import { Servicio } from '../servicios/entities/servicio.entity';
import { Personal } from '../profesionales/entities/personal.entity';

/** Barrera común: se toma después de usuarios y antes de recursos de agenda. */
export async function bloquearNegocioAgenda(manager: EntityManager, negocioId: number): Promise<void> {
  const negocio = await manager.getRepository(Negocio).createQueryBuilder('n')
    .setLock('pessimistic_write').where('n.id = :negocioId', { negocioId }).getOne();
  if (!negocio) throw new NotFoundException('Negocio no disponible.');
}

/** IDs ascendentes conservan el orden compartido en cada clase de recurso. */
export async function bloquearRecursosAgenda(manager: EntityManager, negocioId: number,
  tipo: 'sucursal' | 'servicio' | 'personal', ids: number[]): Promise<void> {
  const entidad = tipo === 'sucursal' ? Sucursal : tipo === 'servicio' ? Servicio : Personal;
  for (const id of [...new Set(ids)].sort((a, b) => a - b)) {
    const fila = await manager.getRepository(entidad).createQueryBuilder('r')
      .setLock('pessimistic_write')
      .where('r.id = :id AND r.negocioId = :negocioId', { id, negocioId }).getOne();
    if (!fila) throw new NotFoundException(`${tipo} no disponible.`);
  }
}
