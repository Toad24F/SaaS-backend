import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Impide nombres repetidos entre las cuentas activas o históricas de un negocio. */
export class NombreUnicoUsuarios1760000023000 implements MigrationInterface {
  name = 'NombreUnicoUsuarios1760000023000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE usuarios
      ADD COLUMN nombre_negocio_unico VARCHAR(180) GENERATED ALWAYS AS (
        CASE WHEN negocio_id IS NOT NULL AND nombre IS NOT NULL
          THEN CONCAT(negocio_id, ':', LOWER(TRIM(nombre)))
          ELSE NULL
        END
      ) STORED,
      ADD UNIQUE KEY uq_usuarios_negocio_nombre (nombre_negocio_unico)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE usuarios DROP INDEX uq_usuarios_negocio_nombre');
    await queryRunner.query('ALTER TABLE usuarios DROP COLUMN nombre_negocio_unico');
  }
}
