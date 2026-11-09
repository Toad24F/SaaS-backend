import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Versiona fichas independientes sin cambiar el índice telefónico compartible. */
export class VersionClientes1760000044000 implements MigrationInterface {
  name = 'VersionClientes1760000044000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE clientes
      ADD version INT UNSIGNED NOT NULL DEFAULT 1,
      ADD CONSTRAINT chk_clientes_version CHECK (version >= 1)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // La reversión no debe borrar la evidencia de correcciones posteriores.
    const [uso] = await queryRunner.query('SELECT COUNT(*) total FROM clientes WHERE version <> 1');
    if (Number(uso.total) > 0) throw new Error('No se puede retirar la versión de clientes sin perder datos.');
    await queryRunner.query('ALTER TABLE clientes DROP CONSTRAINT chk_clientes_version, DROP COLUMN version');
  }
}
