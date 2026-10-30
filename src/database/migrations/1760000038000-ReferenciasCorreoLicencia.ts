import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Amplía la bandeja sin reinterpretar avisos antiguos ni guardar mensajes. */
export class ReferenciasCorreoLicencia1760000038000 implements MigrationInterface {
  name = 'ReferenciasCorreoLicencia1760000038000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE envios_correo DROP CONSTRAINT chk_envios_referencia');
    await queryRunner.query(`ALTER TABLE envios_correo
      MODIFY tipo ENUM('activacion_admin','recuperacion','aviso_vencimiento',
        'aviso_preventivo','licencia_vencida','suspension_programada',
        'suspension_efectiva','suspension_inmediata','suspension_revocada',
        'licencia_reactivada','licencia_renovada') NOT NULL,
      ADD umbral_dias INT UNSIGNED NULL,
      ADD version_suspension INT UNSIGNED NULL,
      ADD operacion_licencia_id BIGINT UNSIGNED NULL,
      ADD INDEX idx_envios_operacion_licencia
        (negocio_id,licencia_id,operacion_licencia_id),
      ADD CONSTRAINT fk_envios_operacion_licencia
        FOREIGN KEY (negocio_id,licencia_id,operacion_licencia_id)
        REFERENCES operaciones_licencia(negocio_id,licencia_id,id)`);
    // Cada tipo tiene una sola identidad lógica: código, vencimiento, ciclo u operación.
    await queryRunner.query(`ALTER TABLE envios_correo
      ADD CONSTRAINT chk_envios_referencia CHECK (COALESCE((
        (tipo IN ('activacion_admin','recuperacion') AND codigo_acceso_id IS NOT NULL
          AND licencia_id IS NULL AND version_vencimiento IS NULL AND umbral_dias IS NULL
          AND version_suspension IS NULL AND operacion_licencia_id IS NULL)
        OR (tipo IN ('aviso_vencimiento','licencia_vencida') AND codigo_acceso_id IS NULL
          AND licencia_id IS NOT NULL AND version_vencimiento >= 1 AND umbral_dias IS NULL
          AND version_suspension IS NULL AND operacion_licencia_id IS NULL)
        OR (tipo = 'aviso_preventivo' AND codigo_acceso_id IS NULL
          AND licencia_id IS NOT NULL AND version_vencimiento >= 1 AND umbral_dias IN (7,15)
          AND version_suspension IS NULL AND operacion_licencia_id IS NULL)
        OR (tipo IN ('suspension_programada','suspension_efectiva','suspension_inmediata')
          AND codigo_acceso_id IS NULL AND licencia_id IS NOT NULL
          AND version_vencimiento IS NULL AND umbral_dias IS NULL
          AND version_suspension >= 1 AND operacion_licencia_id IS NULL)
        OR (tipo IN ('suspension_revocada','licencia_reactivada','licencia_renovada')
          AND codigo_acceso_id IS NULL AND licencia_id IS NOT NULL
          AND version_vencimiento IS NULL AND umbral_dias IS NULL
          AND version_suspension IS NULL AND operacion_licencia_id IS NOT NULL)
      ), 0))`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const [nuevos] = await queryRunner.query(`SELECT COUNT(*) total FROM envios_correo
      WHERE tipo NOT IN ('activacion_admin','recuperacion','aviso_vencimiento')`);
    if (Number(nuevos.total) > 0) {
      throw new Error('No se pueden retirar referencias de correos nuevos sin perder datos.');
    }
    await queryRunner.query(`ALTER TABLE envios_correo
      DROP CONSTRAINT chk_envios_referencia,
      DROP FOREIGN KEY fk_envios_operacion_licencia,
      DROP INDEX idx_envios_operacion_licencia,
      DROP COLUMN operacion_licencia_id,
      DROP COLUMN version_suspension,
      DROP COLUMN umbral_dias,
      MODIFY tipo ENUM('activacion_admin','recuperacion','aviso_vencimiento') NOT NULL`);
    await queryRunner.query(`ALTER TABLE envios_correo ADD CONSTRAINT chk_envios_referencia CHECK (
      (tipo IN ('activacion_admin','recuperacion') AND codigo_acceso_id IS NOT NULL
        AND licencia_id IS NULL AND version_vencimiento IS NULL)
      OR (tipo = 'aviso_vencimiento' AND codigo_acceso_id IS NULL
        AND licencia_id IS NOT NULL AND version_vencimiento >= 1))`);
  }
}
