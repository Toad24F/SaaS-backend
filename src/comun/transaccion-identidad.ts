import { ConflictException } from '@nestjs/common';
import type { DataSource, EntityManager } from 'typeorm';

/** Repite desde cero conflictos de lectura/bloqueo tras el rollback de TypeORM. */
export async function transaccionIdentidad<T>(conexion: DataSource | EntityManager,
  ejecutar: (manager: EntityManager) => Promise<T>): Promise<T> {
  for (let intento = 0; ; intento += 1) {
    try { return await conexion.transaction(ejecutar); }
    catch (error) {
      const codigo = (error as { driverError?: { code?: string } }).driverError?.code;
      if (codigo !== 'ER_CHECKREAD' && codigo !== 'ER_LOCK_DEADLOCK') throw error;
      // Máximo tres transacciones completas; no repite SMTP ni efectos externos.
      if (intento >= 2) throw new ConflictException('Conflicto de identidad. Intenta nuevamente.');
    }
  }
}
