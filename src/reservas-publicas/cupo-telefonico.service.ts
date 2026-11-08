import { ConflictException, Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { Cita } from '../disponibilidad/entities/cita.entity';

export const CAUSA_CUPO_TELEFONICO = 'cupo_telefono_excedido';
export const MENSAJE_CUPO_TELEFONICO =
  'No se puede registrar otra cita con este teléfono en esta sucursal. Contacta al negocio';

/** Lee también los rechazos persistidos por el lote anterior al nombre final. */
export function esCausaCupoTelefonico(causa: string | null): boolean {
  return causa === CAUSA_CUPO_TELEFONICO || causa === 'cupo_telefonico';
}

/** Marca solo el rechazo conocido por cupo; la frontera pública fija su respuesta. */
export class CupoTelefonicoExcedidoException extends ConflictException {
  constructor() { super(MENSAJE_CUPO_TELEFONICO); }
}

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
