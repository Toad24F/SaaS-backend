import type { MigrationInterface, QueryRunner } from 'typeorm';

export class DatosPublicosCatalogo1760000033000 implements MigrationInterface {
  name = 'DatosPublicosCatalogo1760000033000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE negocios
      ADD categoria VARCHAR(100) NULL,
      ADD mostrar_contacto_publico TINYINT(1) NOT NULL DEFAULT 0`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE negocios
      DROP COLUMN mostrar_contacto_publico, DROP COLUMN categoria`);
  }
}
