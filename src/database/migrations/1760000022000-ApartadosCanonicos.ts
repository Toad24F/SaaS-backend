import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Apartados temporales: la vigencia se calcula al leer, no al eliminar filas. */
export class ApartadosCanonicos1760000022000 implements MigrationInterface {
  name = 'ApartadosCanonicos1760000022000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // La identidad del titular queda en hash y las referencias impiden cruces de negocio.
    await queryRunner.query(`CREATE TABLE bloqueos_temporales (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      negocio_id INT UNSIGNED NOT NULL,
      personal_id INT UNSIGNED NOT NULL,
      sucursal_id INT UNSIGNED NOT NULL,
      servicio_id INT UNSIGNED NOT NULL,
      inicio_utc DATETIME(3) NOT NULL,
      fin_utc DATETIME(3) NOT NULL,
      expira_en DATETIME(3) NOT NULL,
      liberado_en DATETIME(3) NULL,
      titular_hash CHAR(64) NOT NULL,
      creado_en DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      PRIMARY KEY (id),
      UNIQUE KEY uq_bt_negocio_id (negocio_id, id),
      INDEX idx_bt_personal_inicio (negocio_id, personal_id, inicio_utc),
      INDEX idx_bt_personal_expira (negocio_id, personal_id, expira_en),
      INDEX idx_bt_sucursal (negocio_id, sucursal_id),
      INDEX idx_bt_servicio (negocio_id, servicio_id),
      CONSTRAINT fk_bt_negocio FOREIGN KEY (negocio_id)
        REFERENCES negocios(id) ON DELETE RESTRICT,
      CONSTRAINT fk_bt_personal FOREIGN KEY (negocio_id, personal_id)
        REFERENCES personal(negocio_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_bt_sucursal FOREIGN KEY (negocio_id, sucursal_id)
        REFERENCES sucursales(negocio_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_bt_servicio FOREIGN KEY (negocio_id, servicio_id)
        REFERENCES servicios(negocio_id, id) ON DELETE RESTRICT,
      CONSTRAINT chk_bt_intervalo CHECK (fin_utc > inicio_utc),
      CONSTRAINT chk_bt_hash CHECK (CHAR_LENGTH(titular_hash) = 64)
    ) ENGINE=InnoDB`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE bloqueos_temporales');
  }
}
