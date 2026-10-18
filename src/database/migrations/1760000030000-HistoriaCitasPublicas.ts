import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Copias históricas para que un resultado no cambie al editar el catálogo. */
export class HistoriaCitasPublicas1760000030000 implements MigrationInterface {
  name = 'HistoriaCitasPublicas1760000030000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Los valores pasados son desconocidos: NULL conserva esa incertidumbre.
    await queryRunner.query(`ALTER TABLE citas
      ADD COLUMN costo_aceptado DECIMAL(10,2) NULL,
      ADD COLUMN nombre_contacto VARCHAR(150) NULL,
      ADD COLUMN telefono_contacto VARCHAR(10) NULL,
      ADD COLUMN nombre_negocio VARCHAR(150) NULL,
      ADD COLUMN nombre_servicio VARCHAR(150) NULL,
      ADD COLUMN nombre_sucursal VARCHAR(150) NULL,
      ADD COLUMN nombre_profesional VARCHAR(150) NULL,
      ADD CONSTRAINT chk_citas_costo_aceptado CHECK
        (costo_aceptado IS NULL OR costo_aceptado >= 0)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE citas
      DROP CONSTRAINT chk_citas_costo_aceptado,
      DROP COLUMN nombre_profesional,
      DROP COLUMN nombre_sucursal,
      DROP COLUMN nombre_servicio,
      DROP COLUMN nombre_negocio,
      DROP COLUMN telefono_contacto,
      DROP COLUMN nombre_contacto,
      DROP COLUMN costo_aceptado`);
  }
}
