import type { MigrationInterface, QueryRunner } from 'typeorm';

/** T17: historial de códigos de un solo uso y sesiones revocables. */
export class CrearCodigosSesiones1760000002000 implements MigrationInterface {
  name = 'CrearCodigosSesiones1760000002000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE codigos_acceso (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        negocio_id INT UNSIGNED NOT NULL,
        usuario_id INT UNSIGNED NOT NULL,
        emisor_usuario_id INT UNSIGNED NOT NULL,
        proposito ENUM(
          'activacion_admin','activacion_recepcionista','recuperacion'
        ) NOT NULL,
        codigo_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
        emitido_en DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        expira_en DATETIME(6) NOT NULL,
        consumido_en DATETIME(6) NULL,
        invalidado_en DATETIME(6) NULL,
        vigente_unico TINYINT AS (
          CASE
            WHEN consumido_en IS NULL AND invalidado_en IS NULL THEN 1
            ELSE NULL
          END
        ) STORED,
        PRIMARY KEY (id),
        UNIQUE KEY uq_codigos_hash (codigo_hash),
        UNIQUE KEY uq_codigos_cuenta_proposito (
          usuario_id, proposito, vigente_unico
        ),
        INDEX idx_codigos_destinatario (negocio_id, usuario_id),
        INDEX idx_codigos_expiracion (expira_en),
        CONSTRAINT fk_codigos_destinatario FOREIGN KEY (negocio_id, usuario_id)
          REFERENCES usuarios(negocio_id, id),
        CONSTRAINT fk_codigos_emisor FOREIGN KEY (emisor_usuario_id)
          REFERENCES usuarios(id),
        CONSTRAINT chk_codigos_hash CHECK (
          CHAR_LENGTH(codigo_hash) = 64
          AND codigo_hash NOT REGEXP '[^0-9a-f]'
        ),
        CONSTRAINT chk_codigos_expiracion CHECK (expira_en > emitido_en),
        CONSTRAINT chk_codigos_consumo CHECK (
          consumido_en IS NULL
          OR (consumido_en >= emitido_en AND consumido_en < expira_en)
        ),
        CONSTRAINT chk_codigos_invalidacion CHECK (
          invalidado_en IS NULL OR invalidado_en >= emitido_en
        ),
        CONSTRAINT chk_codigos_estado CHECK (
          consumido_en IS NULL OR invalidado_en IS NULL
        )
      ) ENGINE=InnoDB
    `);
    await queryRunner.query(`
      CREATE TABLE sesiones (
        id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
        usuario_id INT UNSIGNED NOT NULL,
        creada_en DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        expira_en DATETIME(6) NOT NULL,
        revocada_en DATETIME(6) NULL,
        PRIMARY KEY (id),
        INDEX idx_sesiones_usuario (usuario_id, revocada_en, expira_en),
        INDEX idx_sesiones_expiracion (expira_en),
        CONSTRAINT fk_sesiones_usuario FOREIGN KEY (usuario_id)
          REFERENCES usuarios(id),
        CONSTRAINT chk_sesiones_expiracion CHECK (
          expira_en = DATE_ADD(creada_en, INTERVAL 1 HOUR)
        ),
        CONSTRAINT chk_sesiones_revocacion CHECK (
          revocada_en IS NULL OR revocada_en >= creada_en
        )
      ) ENGINE=InnoDB
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE sesiones');
    await queryRunner.query('DROP TABLE codigos_acceso');
  }
}
