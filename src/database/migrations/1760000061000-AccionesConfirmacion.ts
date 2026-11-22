import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Solo el hash persiste: la FK ata acción, envío, cita y generación al mismo negocio. */
export class AccionesConfirmacion1760000061000 implements MigrationInterface {
  name = 'AccionesConfirmacion1760000061000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE acciones_confirmacion (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      negocio_id INT UNSIGNED NOT NULL,
      cita_id INT UNSIGNED NOT NULL,
      generacion INT UNSIGNED NOT NULL,
      tipo_envio ENUM('inicial_pendiente','inicial_confirmada','recordatorio') NOT NULL DEFAULT 'inicial_pendiente',
      envio_id BIGINT UNSIGNED NOT NULL,
      token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      expira_en DATETIME(3) NOT NULL,
      consumido_en DATETIME(3) NULL,
      creado_en DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (id),
      UNIQUE KEY uq_ac_hash (token_hash),
      UNIQUE KEY uq_ac_envio (negocio_id,envio_id),
      INDEX idx_ac_generacion (negocio_id,cita_id,generacion),
      CONSTRAINT fk_ac_envio FOREIGN KEY (negocio_id,cita_id,generacion,tipo_envio,envio_id)
        REFERENCES envios_whatsapp(negocio_id,cita_id,generacion,tipo,id) ON DELETE RESTRICT,
      CONSTRAINT chk_ac_tipo CHECK (tipo_envio='inicial_pendiente'),
      CONSTRAINT chk_ac_hash CHECK (token_hash REGEXP '^[0-9a-f]{64}$'),
      CONSTRAINT chk_ac_vencimiento CHECK (expira_en > creado_en),
      CONSTRAINT chk_ac_consumo CHECK (consumido_en IS NULL OR consumido_en >= creado_en)
    ) ENGINE=InnoDB`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const [uso] = await queryRunner.query('SELECT COUNT(*) total FROM acciones_confirmacion');
    if (Number(uso.total)) throw new Error('No se pueden retirar acciones de confirmación en uso.');
    await queryRunner.query('DROP TABLE acciones_confirmacion');
  }
}
