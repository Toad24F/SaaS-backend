import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Agrega solicitud, bloqueo de gracia y remanente sin alterar migraciones históricas. */
export class SuspensionProgramadaLicencias1760000009000 implements MigrationInterface {
  name = 'SuspensionProgramadaLicencias1760000009000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE licencias
      ADD COLUMN suspension_solicitada_en DATETIME(6) NULL,
      ADD COLUMN bloqueo_programado_en DATETIME(6) NULL,
      ADD COLUMN congelada_en DATETIME(6) NULL,
      ADD COLUMN remanente_ms BIGINT UNSIGNED NULL,
      ADD COLUMN version_vencimiento INT UNSIGNED NOT NULL DEFAULT 0`);
    // Las suspensiones previas ya estaban efectivas: no se les concede una nueva gracia.
    await queryRunner.query(`UPDATE licencias
      SET suspension_solicitada_en = suspendida_en,
          bloqueo_programado_en = suspendida_en,
          congelada_en = suspendida_en,
          remanente_ms = CASE WHEN vence_en IS NULL THEN NULL
            ELSE GREATEST(TIMESTAMPDIFF(MICROSECOND, suspendida_en, vence_en) DIV 1000, 0) END
      WHERE suspendida_en IS NOT NULL`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE licencias
      DROP COLUMN version_vencimiento, DROP COLUMN remanente_ms,
      DROP COLUMN congelada_en, DROP COLUMN bloqueo_programado_en,
      DROP COLUMN suspension_solicitada_en`);
  }
}
