import type { MigrationInterface, QueryRunner } from 'typeorm';

const expresionActor = `CASE
  WHEN actor_usuario_id IS NOT NULL THEN 'usuario'
  WHEN sesion_publica_id IS NOT NULL THEN 'sesion_publica'
  WHEN referencia_whatsapp IS NOT NULL THEN 'cliente_whatsapp'
  WHEN proceso_sistema IS NOT NULL THEN 'sistema'
  ELSE NULL END`;

/** El tipo derivado cubre eventos heredados sin actualizar filas protegidas por triggers. */
export class ActoresEventosCita1760000057000 implements MigrationInterface {
  name = 'ActoresEventosCita1760000057000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE eventos_cita
      DROP CONSTRAINT chk_ec_actor,
      ADD referencia_whatsapp VARCHAR(128) NULL,
      ADD proceso_sistema VARCHAR(80) NULL,
      ADD actor_tipo VARCHAR(20) AS (${expresionActor}) PERSISTENT,
      ADD INDEX idx_ec_referencia_whatsapp (negocio_id,referencia_whatsapp),
      ADD CONSTRAINT chk_ec_actor CHECK (
        (actor_usuario_id IS NOT NULL) + (sesion_publica_id IS NOT NULL)
        + (referencia_whatsapp IS NOT NULL) + (proceso_sistema IS NOT NULL) = 1),
      ADD CONSTRAINT chk_ec_referencia_whatsapp CHECK (
        referencia_whatsapp IS NULL OR CHAR_LENGTH(TRIM(referencia_whatsapp)) > 0),
      ADD CONSTRAINT chk_ec_proceso_sistema CHECK (
        proceso_sistema IS NULL OR CHAR_LENGTH(TRIM(proceso_sistema)) > 0),
      ADD CONSTRAINT chk_ec_accion_whatsapp CHECK (referencia_whatsapp IS NULL OR accion='cambio_estado'),
      ADD CONSTRAINT chk_ec_accion_sistema CHECK (proceso_sistema IS NULL OR accion='cancelacion')`);
    // La sesión pública sigue limitada al alta; los otros actores no reciben ese permiso.
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const [uso] = await queryRunner.query(`SELECT COUNT(*) total FROM eventos_cita
      WHERE referencia_whatsapp IS NOT NULL OR proceso_sistema IS NOT NULL`);
    if (Number(uso.total)) throw new Error('No se pueden retirar actores externos o de sistema en uso.');
    await queryRunner.query(`ALTER TABLE eventos_cita
      DROP CONSTRAINT chk_ec_actor,
      DROP CONSTRAINT chk_ec_referencia_whatsapp,
      DROP CONSTRAINT chk_ec_proceso_sistema,
      DROP CONSTRAINT chk_ec_accion_whatsapp,
      DROP CONSTRAINT chk_ec_accion_sistema,
      DROP INDEX idx_ec_referencia_whatsapp,
      DROP COLUMN actor_tipo,
      DROP COLUMN referencia_whatsapp,
      DROP COLUMN proceso_sistema,
      ADD CONSTRAINT chk_ec_actor CHECK (
        (actor_usuario_id IS NOT NULL AND sesion_publica_id IS NULL)
        OR (actor_usuario_id IS NULL AND sesion_publica_id IS NOT NULL))`);
  }
}
