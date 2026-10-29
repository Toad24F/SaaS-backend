import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Amplía apartados sin alterar los intervalos ni inventar datos de filas previas. */
export class ContextoApartadosPublicos1760000028000 implements MigrationInterface {
  name = 'ContextoApartadosPublicos1760000028000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Todas las columnas nuevas admiten NULL para apartados históricos.
    await queryRunner.query(`ALTER TABLE bloqueos_temporales
      ADD COLUMN costo_aceptado DECIMAL(10,2) NULL,
      ADD COLUMN zona_horaria_apartado VARCHAR(64) NULL,
      ADD COLUMN sesion_id INT UNSIGNED NULL,
      ADD COLUMN generacion BIGINT UNSIGNED NULL,
      ADD COLUMN operacion_id BIGINT UNSIGNED NULL,
      ADD INDEX idx_bt_sesion (negocio_id, sesion_id),
      ADD INDEX idx_bt_operacion (negocio_id, operacion_id),
      ADD CONSTRAINT chk_bt_costo_aceptado CHECK
        (costo_aceptado IS NULL OR costo_aceptado >= 0)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE bloqueos_temporales
      DROP CONSTRAINT chk_bt_costo_aceptado,
      DROP INDEX idx_bt_operacion,
      DROP INDEX idx_bt_sesion,
      DROP COLUMN operacion_id,
      DROP COLUMN generacion,
      DROP COLUMN sesion_id,
      DROP COLUMN zona_horaria_apartado,
      DROP COLUMN costo_aceptado`);
  }
}
