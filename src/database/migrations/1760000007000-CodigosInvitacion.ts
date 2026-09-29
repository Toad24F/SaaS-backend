import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Añade códigos derivados y destino de invitación sin reescribir la fase 1. */
export class CodigosInvitacion1760000007000 implements MigrationInterface {
  name = 'CodigosInvitacion1760000007000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // La versión cambia cuando el destinatario corrige su dirección.
    await queryRunner.query(`ALTER TABLE altas_administrador
      ADD COLUMN correo_version INT UNSIGNED NOT NULL DEFAULT 1,
      ADD CONSTRAINT chk_altas_correo_version CHECK (correo_version >= 1)`);
    await queryRunner.query(`ALTER TABLE usuarios
      ADD COLUMN correo_version INT UNSIGNED NOT NULL DEFAULT 1,
      ADD CONSTRAINT chk_usuarios_correo_version CHECK (correo_version >= 1)`);
    await queryRunner.query('ALTER TABLE codigos_acceso DROP FOREIGN KEY fk_codigos_destinatario');
    await queryRunner.query(`ALTER TABLE codigos_acceso
      MODIFY COLUMN usuario_id INT UNSIGNED NULL,
      ADD COLUMN alta_administrador_id INT UNSIGNED NULL,
      ADD COLUMN destinatario_version INT UNSIGNED NOT NULL DEFAULT 1,
      ADD COLUMN emision_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
      ADD COLUMN nonce CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NULL,
      ADD COLUMN clave_version INT UNSIGNED NULL,
      ADD COLUMN correo_destinatario VARCHAR(150) NULL,
      ADD COLUMN legado_fase_1 BOOLEAN NOT NULL DEFAULT FALSE,
      ADD UNIQUE KEY uq_codigos_alta_proposito
        (alta_administrador_id, proposito, vigente_unico),
      ADD UNIQUE KEY uq_codigos_emision (emision_id),
      ADD INDEX idx_codigos_alta (negocio_id, alta_administrador_id),
      ADD CONSTRAINT fk_codigos_destinatario FOREIGN KEY (negocio_id, usuario_id)
        REFERENCES usuarios(negocio_id, id),
      ADD CONSTRAINT fk_codigos_alta FOREIGN KEY (negocio_id, alta_administrador_id)
        REFERENCES altas_administrador(negocio_id, id)`);
    // El respaldo histórico debe marcarse antes de activar las restricciones nuevas.
    await queryRunner.query('UPDATE codigos_acceso SET legado_fase_1 = 1');
    await queryRunner.query(`ALTER TABLE codigos_acceso
      ADD CONSTRAINT chk_codigos_destino CHECK (
        (proposito = 'activacion_admin' AND alta_administrador_id IS NOT NULL
          AND usuario_id IS NULL AND legado_fase_1 = 0)
        OR (proposito = 'recuperacion' AND usuario_id IS NOT NULL
          AND alta_administrador_id IS NULL)
        OR (proposito = 'activacion_admin' AND usuario_id IS NOT NULL
          AND alta_administrador_id IS NULL AND legado_fase_1 = 1)
      ),
      ADD CONSTRAINT chk_codigos_derivacion CHECK (
        (legado_fase_1 = 1 AND emision_id IS NULL AND nonce IS NULL
          AND clave_version IS NULL AND correo_destinatario IS NULL)
        OR (legado_fase_1 = 0 AND emision_id IS NOT NULL AND nonce IS NOT NULL
          AND clave_version IS NOT NULL AND correo_destinatario IS NOT NULL)
      ),
      ADD CONSTRAINT chk_codigos_version CHECK (destinatario_version >= 1
        AND (clave_version IS NULL OR clave_version >= 1)),
      ADD CONSTRAINT chk_codigos_correo CHECK (correo_destinatario IS NULL OR
        (BINARY correo_destinatario = BINARY LOWER(TRIM(correo_destinatario))
          AND CHAR_LENGTH(correo_destinatario) > 0))`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Solo puede revertirse después de retirar emisiones nuevas de invitación.
    await queryRunner.query(`ALTER TABLE codigos_acceso
      DROP FOREIGN KEY fk_codigos_alta,
      DROP FOREIGN KEY fk_codigos_destinatario,
      DROP CONSTRAINT chk_codigos_correo,
      DROP CONSTRAINT chk_codigos_version,
      DROP CONSTRAINT chk_codigos_derivacion,
      DROP CONSTRAINT chk_codigos_destino,
      DROP INDEX idx_codigos_alta,
      DROP INDEX uq_codigos_emision,
      DROP INDEX uq_codigos_alta_proposito,
      DROP COLUMN legado_fase_1,
      DROP COLUMN correo_destinatario,
      DROP COLUMN clave_version,
      DROP COLUMN nonce,
      DROP COLUMN emision_id,
      DROP COLUMN destinatario_version,
      DROP COLUMN alta_administrador_id,
      MODIFY COLUMN usuario_id INT UNSIGNED NOT NULL,
      ADD CONSTRAINT fk_codigos_destinatario FOREIGN KEY (negocio_id, usuario_id)
        REFERENCES usuarios(negocio_id, id)`);
    await queryRunner.query(`ALTER TABLE usuarios
      DROP CONSTRAINT chk_usuarios_correo_version, DROP COLUMN correo_version`);
    await queryRunner.query(`ALTER TABLE altas_administrador
      DROP CONSTRAINT chk_altas_correo_version, DROP COLUMN correo_version`);
  }
}
