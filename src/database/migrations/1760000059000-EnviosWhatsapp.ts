import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Outbox: una clave de efecto y un tipo por generación sobreviven reintentos y reinicios. */
export class EnviosWhatsapp1760000059000 implements MigrationInterface {
  name = 'EnviosWhatsapp1760000059000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE envios_whatsapp (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      negocio_id INT UNSIGNED NOT NULL,
      cita_id INT UNSIGNED NOT NULL,
      generacion INT UNSIGNED NOT NULL,
      tipo ENUM('inicial_pendiente','inicial_confirmada','recordatorio') NOT NULL,
      clave_efecto VARCHAR(160) NOT NULL,
      destino_e164 VARCHAR(16) NOT NULL,
      parametros_plantilla JSON NOT NULL,
      programado_en DATETIME(3) NOT NULL,
      util_hasta DATETIME(3) NOT NULL,
      estado ENUM('pendiente','en_proceso','aceptado','entregado','leido','fallido','incierto','descartado') NOT NULL DEFAULT 'pendiente',
      intentos INT UNSIGNED NOT NULL DEFAULT 0,
      proximo_intento_en DATETIME(3) NOT NULL,
      arrendamiento_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
      arrendado_hasta DATETIME(3) NULL,
      referencia_externa VARCHAR(128) NULL,
      aceptado_en DATETIME(3) NULL,
      entregado_en DATETIME(3) NULL,
      leido_en DATETIME(3) NULL,
      ultimo_error VARCHAR(255) NULL,
      creado_en DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      actualizado_en DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
      PRIMARY KEY (id),
      UNIQUE KEY uq_ew_negocio_id (negocio_id,id),
      UNIQUE KEY uq_ew_accion_referencia (negocio_id,cita_id,generacion,tipo,id),
      UNIQUE KEY uq_ew_clave_efecto (negocio_id,clave_efecto),
      UNIQUE KEY uq_ew_generacion_tipo (negocio_id,cita_id,generacion,tipo),
      UNIQUE KEY uq_ew_referencia_externa (negocio_id,referencia_externa),
      INDEX idx_ew_trabajo (estado,proximo_intento_en,arrendado_hasta),
      INDEX idx_ew_cita (negocio_id,cita_id,generacion),
      CONSTRAINT fk_ew_canal FOREIGN KEY (negocio_id) REFERENCES canales_whatsapp(negocio_id) ON DELETE RESTRICT,
      CONSTRAINT fk_ew_condicion FOREIGN KEY (negocio_id,cita_id,generacion)
        REFERENCES condiciones_confirmacion_cita(negocio_id,cita_id,generacion) ON DELETE RESTRICT,
      CONSTRAINT chk_ew_clave CHECK (BINARY clave_efecto = BINARY TRIM(clave_efecto) AND CHAR_LENGTH(clave_efecto) > 0),
      CONSTRAINT chk_ew_destino CHECK (destino_e164 REGEXP '^[+][1-9][0-9]{6,14}$'),
      CONSTRAINT chk_ew_utilidad CHECK (util_hasta > programado_en),
      CONSTRAINT chk_ew_arrendamiento CHECK (
        (estado='en_proceso' AND arrendamiento_id IS NOT NULL AND arrendado_hasta IS NOT NULL)
        OR (estado<>'en_proceso' AND arrendamiento_id IS NULL AND arrendado_hasta IS NULL))
    ) ENGINE=InnoDB`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const [uso] = await queryRunner.query('SELECT COUNT(*) total FROM envios_whatsapp');
    if (Number(uso.total)) throw new Error('No se pueden retirar envíos WhatsApp en uso.');
    await queryRunner.query('DROP TABLE envios_whatsapp');
  }
}
