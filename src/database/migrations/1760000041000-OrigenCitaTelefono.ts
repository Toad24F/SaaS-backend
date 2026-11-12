import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Un apartado solo puede producir una cita; el índice acelera el cupo telefónico. */
export class OrigenCitaTelefono1760000041000 implements MigrationInterface {
  name = 'OrigenCitaTelefono1760000041000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE citas
      ADD apartado_origen_id INT UNSIGNED NULL,
      ADD UNIQUE KEY uq_citas_apartado_origen (negocio_id,apartado_origen_id),
      ADD INDEX idx_citas_contacto_sucursal_inicio
        (negocio_id,sucursal_id,telefono_contacto,inicio_utc),
      ADD CONSTRAINT fk_citas_apartado_origen
        FOREIGN KEY (negocio_id,apartado_origen_id)
        REFERENCES bloqueos_temporales(negocio_id,id) ON DELETE RESTRICT`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const [origenes] = await queryRunner.query(`SELECT COUNT(*) total FROM citas
      WHERE apartado_origen_id IS NOT NULL`);
    if (Number(origenes.total) > 0) {
      throw new Error('No se puede retirar el origen de citas registradas sin perder datos.');
    }
    await queryRunner.query(`ALTER TABLE citas
      DROP FOREIGN KEY fk_citas_apartado_origen,
      DROP INDEX idx_citas_contacto_sucursal_inicio,
      DROP INDEX uq_citas_apartado_origen,
      DROP COLUMN apartado_origen_id`);
  }
}
