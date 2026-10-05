import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Permite materializar la gracia de 48 h aunque alcance el vencimiento natural. */
export class SuspensionTrasVencimiento1760000016000 implements MigrationInterface {
  name = 'SuspensionTrasVencimiento1760000016000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE licencias DROP CONSTRAINT chk_licencias_suspension');
    await queryRunner.query(`ALTER TABLE licencias ADD CONSTRAINT chk_licencias_suspension
      CHECK (suspendida_en IS NULL OR (suspendida_en >= creado_en AND
        (habilitada_en IS NULL OR suspendida_en >= habilitada_en)))`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE licencias DROP CONSTRAINT chk_licencias_suspension');
    await queryRunner.query(`ALTER TABLE licencias ADD CONSTRAINT chk_licencias_suspension
      CHECK (suspendida_en IS NULL OR (suspendida_en >= creado_en AND
        (habilitada_en IS NULL OR (suspendida_en >= habilitada_en AND
          suspendida_en < vence_en))))`);
  }
}
