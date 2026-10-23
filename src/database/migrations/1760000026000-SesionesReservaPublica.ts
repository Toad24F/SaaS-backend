import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Identidad anónima por negocio: solo persiste el hash de la credencial. */
export class SesionesReservaPublica1760000026000 implements MigrationInterface {
  name = 'SesionesReservaPublica1760000026000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // El puntero al apartado queda anulable; su FK circular se completa en T014.
    await queryRunner.query(`CREATE TABLE sesiones_reserva_publica (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      negocio_id INT UNSIGNED NOT NULL,
      titular_hash CHAR(64) NOT NULL,
      generacion BIGINT UNSIGNED NOT NULL DEFAULT 0,
      apartado_actual_id INT UNSIGNED NULL,
      creado_en DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      actualizado_en DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
        ON UPDATE CURRENT_TIMESTAMP(6),
      PRIMARY KEY (id),
      UNIQUE KEY uq_srp_negocio_id (negocio_id, id),
      UNIQUE KEY uq_srp_negocio_hash (negocio_id, titular_hash),
      INDEX idx_srp_apartado (negocio_id, apartado_actual_id),
      CONSTRAINT fk_srp_negocio FOREIGN KEY (negocio_id)
        REFERENCES negocios(id) ON DELETE RESTRICT,
      CONSTRAINT chk_srp_hash CHECK (CHAR_LENGTH(titular_hash) = 64)
    ) ENGINE=InnoDB`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE sesiones_reserva_publica');
  }
}
