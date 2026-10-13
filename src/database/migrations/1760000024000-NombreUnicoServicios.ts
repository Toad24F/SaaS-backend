import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Impide nombres repetidos entre Servicios activos o históricos de un negocio. */
export class NombreUnicoServicios1760000024000 implements MigrationInterface {
  name = 'NombreUnicoServicios1760000024000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE servicios
      ADD COLUMN nombre_negocio_unico VARCHAR(180) GENERATED ALWAYS AS (
        CASE WHEN negocio_id IS NOT NULL AND nombre IS NOT NULL
          THEN CONCAT(negocio_id, ':', LOWER(TRIM(nombre)))
          ELSE NULL
        END
      ) STORED,
      ADD UNIQUE KEY uq_servicios_negocio_nombre (nombre_negocio_unico)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE servicios DROP INDEX uq_servicios_negocio_nombre');
    await queryRunner.query('ALTER TABLE servicios DROP COLUMN nombre_negocio_unico');
  }
}
