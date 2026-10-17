import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Impide nombres repetidos entre sucursales activas o históricas de un negocio. */
export class NombreUnicoSucursales1760000025000 implements MigrationInterface {
  name = 'NombreUnicoSucursales1760000025000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE sucursales
      ADD COLUMN nombre_negocio_unico VARCHAR(180) GENERATED ALWAYS AS (
        CASE WHEN negocio_id IS NOT NULL AND nombre IS NOT NULL
          THEN CONCAT(negocio_id, ':', LOWER(TRIM(nombre)))
          ELSE NULL
        END
      ) STORED,
      ADD UNIQUE KEY uq_sucursales_negocio_nombre (nombre_negocio_unico)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE sucursales DROP INDEX uq_sucursales_negocio_nombre');
    await queryRunner.query('ALTER TABLE sucursales DROP COLUMN nombre_negocio_unico');
  }
}
