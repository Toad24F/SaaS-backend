import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { Cita } from '../disponibilidad/entities/cita.entity';

/** Consulta el cupo desde la misma transacción que insertará la cita. */
@Injectable()
export class CupoTelefonicoService {
  async contar(manager: EntityManager, negocioId: number, sucursalId: number,
    telefonoNormalizado: string, ahora: Date): Promise<number> {
    if (!manager.queryRunner?.isTransactionActive) {
      throw new Error('El cupo telefónico requiere una transacción activa.');
    }
    // El índice por negocio, sucursal, teléfono e inicio acota la lectura.
    // Solo la cita persistida ocupa cupo; los apartados no se consultan aquí.
    return manager.getRepository(Cita).createQueryBuilder('cita')
      .where('cita.negocioId = :negocioId AND cita.sucursalId = :sucursalId',
        { negocioId, sucursalId })
      .andWhere('cita.telefonoContacto = :telefono', { telefono: telefonoNormalizado })
      .andWhere('cita.inicioUtc > :ahora', { ahora })
      .andWhere('cita.estado <> :cancelada', { cancelada: 'cancelada' })
      .getCount();
  }
}
