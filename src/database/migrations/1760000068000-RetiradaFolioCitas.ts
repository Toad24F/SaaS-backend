import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Retira el campo de presentación después de actualizar escritores y consumidores. */
export class RetiradaFolioCitas1760000068000 implements MigrationInterface {
  name = 'RetiradaFolioCitas1760000068000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE citas DROP INDEX uq_citas_folio, DROP COLUMN folio');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Solo las bases de prueba aún vacías pueden volver al contrato antiguo.
    // Con citas reales no se inventan valores ni se permite una reversión destructiva.
    const [uso] = await queryRunner.query('SELECT COUNT(*) total FROM citas');
    if (Number(uso.total) > 0) throw new Error('La retirada de folio requiere una corrección hacia delante.');
    await queryRunner.query('ALTER TABLE citas ADD folio VARCHAR(20) NOT NULL, ADD UNIQUE INDEX uq_citas_folio (folio)');
  }
}
