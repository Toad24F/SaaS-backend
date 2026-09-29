import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Bandeja durable con destinatario y referencia; nunca almacena el mensaje. */
export class BandejaCorreo1760000008000 implements MigrationInterface {
  name = 'BandejaCorreo1760000008000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // La FK compuesta de códigos necesita una clave que incluya el negocio.
    await queryRunner.query(`ALTER TABLE codigos_acceso
      ADD UNIQUE KEY uq_codigos_negocio_id (negocio_id, id)`);
    await queryRunner.query(`CREATE TABLE envios_correo (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      negocio_id INT UNSIGNED NOT NULL,
      tipo ENUM('activacion_admin','recuperacion','aviso_vencimiento') NOT NULL,
      correo_destinatario VARCHAR(150) NOT NULL,
      clave_dedupe VARCHAR(160) NOT NULL,
      codigo_acceso_id BIGINT UNSIGNED NULL,
      licencia_id INT UNSIGNED NULL,
      version_vencimiento INT UNSIGNED NULL,
      estado ENUM('pendiente','tomado','enviado','fallido','descartado') NOT NULL DEFAULT 'pendiente',
      intentos INT UNSIGNED NOT NULL DEFAULT 0,
      proximo_intento_en DATETIME(6) NOT NULL,
      arrendamiento_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
      arrendado_hasta DATETIME(6) NULL,
      confirmado_en DATETIME(6) NULL,
      ultimo_error VARCHAR(255) NULL,
      creado_en DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      actualizado_en DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
      PRIMARY KEY (id),
      UNIQUE KEY uq_envios_clave_dedupe (clave_dedupe),
      INDEX idx_envios_trabajo (estado, proximo_intento_en, arrendado_hasta),
      INDEX idx_envios_codigo (negocio_id, codigo_acceso_id),
      INDEX idx_envios_licencia (negocio_id, licencia_id),
      CONSTRAINT fk_envios_negocio FOREIGN KEY (negocio_id) REFERENCES negocios(id),
      CONSTRAINT fk_envios_codigo FOREIGN KEY (negocio_id, codigo_acceso_id)
        REFERENCES codigos_acceso(negocio_id, id),
      CONSTRAINT fk_envios_licencia FOREIGN KEY (negocio_id, licencia_id)
        REFERENCES licencias(negocio_id, id),
      CONSTRAINT chk_envios_clave CHECK (
        BINARY clave_dedupe = BINARY TRIM(clave_dedupe) AND CHAR_LENGTH(clave_dedupe) > 0),
      CONSTRAINT chk_envios_correo CHECK (
        BINARY correo_destinatario = BINARY LOWER(TRIM(correo_destinatario))
        AND CHAR_LENGTH(correo_destinatario) > 0),
      CONSTRAINT chk_envios_referencia CHECK (
        (tipo IN ('activacion_admin','recuperacion') AND codigo_acceso_id IS NOT NULL
          AND licencia_id IS NULL AND version_vencimiento IS NULL)
        OR (tipo = 'aviso_vencimiento' AND codigo_acceso_id IS NULL
          AND licencia_id IS NOT NULL AND version_vencimiento >= 1)),
      CONSTRAINT chk_envios_intentos CHECK (intentos >= 0),
      CONSTRAINT chk_envios_arrendamiento CHECK (
        (estado = 'tomado' AND arrendamiento_id IS NOT NULL AND arrendado_hasta IS NOT NULL)
        OR (estado <> 'tomado' AND arrendamiento_id IS NULL AND arrendado_hasta IS NULL)),
      CONSTRAINT chk_envios_confirmacion CHECK (
        (estado = 'enviado' AND confirmado_en IS NOT NULL)
        OR (estado <> 'enviado' AND confirmado_en IS NULL))
    ) ENGINE=InnoDB`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Primero se retira la FK de la bandeja; las emisiones históricas quedan intactas.
    await queryRunner.query('DROP TABLE envios_correo');
    await queryRunner.query('ALTER TABLE codigos_acceso DROP INDEX uq_codigos_negocio_id');
  }
}
