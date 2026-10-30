import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Añade contexto de suspensión sin recalcular fechas o remanentes existentes. */
export class PlazoCicloSuspension1760000036000 implements MigrationInterface {
  name = 'PlazoCicloSuspension1760000036000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE licencias
      ADD plazo_suspension_dias INT UNSIGNED NULL,
      ADD version_suspension INT UNSIGNED NOT NULL DEFAULT 0,
      ADD CONSTRAINT chk_licencias_plazo_suspension
        CHECK (plazo_suspension_dias IS NULL OR plazo_suspension_dias BETWEEN 0 AND 30)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE licencias
      DROP CONSTRAINT chk_licencias_plazo_suspension,
      DROP COLUMN version_suspension,
      DROP COLUMN plazo_suspension_dias`);
  }
}
