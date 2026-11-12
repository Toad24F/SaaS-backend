import { ConflictException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';

/** Los datos retirados se conservan, pero impiden operar sin una transición explícita. */
export async function exigirHorarioTransicionado(manager: EntityManager,
  negocioId: number, personalId: number): Promise<void> {
  const [filas] = await manager.query(`SELECT
    (SELECT COUNT(*) FROM excepciones_horario WHERE negocio_id=? AND personal_id=?) excepciones,
    (SELECT COUNT(*) FROM horarios_personal WHERE negocio_id=? AND personal_id=?
      AND (descanso_inicio_minutos IS NOT NULL OR descanso_fin_minutos IS NOT NULL)) descansos`,
  [negocioId, personalId, negocioId, personalId]);
  if (Number(filas.excepciones) || Number(filas.descansos)) {
    throw new ConflictException('Horario histórico requiere transición antes de operar.');
  }
}
