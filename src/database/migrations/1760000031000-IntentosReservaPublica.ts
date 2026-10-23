import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Resultado durable e idempotente de cada envío de reserva. */
export class IntentosReservaPublica1760000031000 implements MigrationInterface {
  name = 'IntentosReservaPublica1760000031000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // NULL en formulario_hash permite preparar antes de recibir datos de contacto.
    await queryRunner.query(`CREATE TABLE intentos_reserva_publica (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      negocio_id INT UNSIGNED NOT NULL,
      sesion_id INT UNSIGNED NOT NULL,
      clave VARCHAR(64) NOT NULL,
      apartado_id INT UNSIGNED NOT NULL,
      formulario_hash CHAR(64) NULL,
      estado ENUM('preparado','registrado','no_registrado')
        NOT NULL DEFAULT 'preparado',
      causa_publica VARCHAR(64) NULL,
      cita_id INT UNSIGNED NULL,
      creado_en DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      actualizado_en DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
        ON UPDATE CURRENT_TIMESTAMP(6),
      PRIMARY KEY (id),
      UNIQUE KEY uq_irp_negocio_id (negocio_id, id),
      UNIQUE KEY uq_irp_sesion_clave (negocio_id, sesion_id, clave),
      UNIQUE KEY uq_irp_cita (negocio_id, cita_id),
      INDEX idx_irp_apartado (negocio_id, apartado_id),
      CONSTRAINT fk_irp_sesion FOREIGN KEY (negocio_id, sesion_id)
        REFERENCES sesiones_reserva_publica(negocio_id, id) ON DELETE RESTRICT,
      CONSTRAINT chk_irp_formulario_hash CHECK
        (formulario_hash IS NULL OR CHAR_LENGTH(formulario_hash) = 64)
    ) ENGINE=InnoDB`);
    // FKs de apartado y cita se incorporan en T014 con las referencias circulares.
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE intentos_reserva_publica');
  }
}
