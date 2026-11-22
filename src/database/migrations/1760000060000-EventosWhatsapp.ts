import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Inbox de recibos: la huella estable impide registrar dos veces el mismo callback. */
export class EventosWhatsapp1760000060000 implements MigrationInterface {
  name = 'EventosWhatsapp1760000060000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE eventos_whatsapp (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      negocio_id INT UNSIGNED NOT NULL,
      huella_evento CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      evento_externo_id VARCHAR(128) NULL,
      mensaje_externo_id VARCHAR(128) NULL,
      tipo ENUM('enviado','entregado','leido','respuesta','fallo') NOT NULL,
      recibido_en DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      proveedor_en DATETIME(6) NULL,
      remitente_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
      accion_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
      estado_procesamiento ENUM('pendiente','en_proceso','procesado','fallido') NOT NULL DEFAULT 'pendiente',
      procesado_en DATETIME(6) NULL,
      ultimo_error VARCHAR(255) NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_evw_huella (negocio_id,huella_evento),
      INDEX idx_evw_trabajo (estado_procesamiento,recibido_en),
      INDEX idx_evw_mensaje (negocio_id,mensaje_externo_id),
      CONSTRAINT fk_evw_canal FOREIGN KEY (negocio_id) REFERENCES canales_whatsapp(negocio_id) ON DELETE RESTRICT,
      CONSTRAINT chk_evw_huella CHECK (huella_evento REGEXP '^[0-9a-f]{64}$'),
      CONSTRAINT chk_evw_remitente CHECK (remitente_hash IS NULL OR remitente_hash REGEXP '^[0-9a-f]{64}$'),
      CONSTRAINT chk_evw_accion CHECK (accion_hash IS NULL OR accion_hash REGEXP '^[0-9a-f]{64}$'),
      CONSTRAINT chk_evw_procesado CHECK (estado_procesamiento='procesado' AND procesado_en IS NOT NULL
        OR estado_procesamiento<>'procesado' AND procesado_en IS NULL)
    ) ENGINE=InnoDB`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const [uso] = await queryRunner.query('SELECT COUNT(*) total FROM eventos_whatsapp');
    if (Number(uso.total)) throw new Error('No se pueden retirar eventos WhatsApp en uso.');
    await queryRunner.query('DROP TABLE eventos_whatsapp');
  }
}
