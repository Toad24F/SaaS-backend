import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Inicializa la concurrencia optimista sin reconstruir snapshots ni estados. */
export class VersionCitas1760000043000 implements MigrationInterface {
  name = 'VersionCitas1760000043000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // El DEFAULT alcanza filas anteriores y altas del escritor público existente.
    await queryRunner.query(`ALTER TABLE citas
      ADD version INT UNSIGNED NOT NULL DEFAULT 1,
      ADD CONSTRAINT chk_citas_version CHECK (version >= 1)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // No retirar la versión si una edición real ya la utilizó.
    const [uso] = await queryRunner.query('SELECT COUNT(*) total FROM citas WHERE version <> 1');
    if (Number(uso.total) > 0) throw new Error('No se puede retirar la versión de citas sin perder datos.');
    await queryRunner.query('ALTER TABLE citas DROP CONSTRAINT chk_citas_version, DROP COLUMN version');
  }
}
