import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Añade identidad de fase 2 sin modificar las cuatro migraciones históricas. */
export class IdentidadPendiente1760000004000 implements MigrationInterface {
  name = 'IdentidadPendiente1760000004000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // RFC y destinatario admiten nulo durante la transición del alta histórica.
    await queryRunner.query(`
      ALTER TABLE negocios
        ADD COLUMN rfc VARCHAR(13) NULL,
        ADD COLUMN correo_administrador VARCHAR(150) NULL,
        ADD COLUMN limite_sucursales_activas INT UNSIGNED NOT NULL DEFAULT 1,
        ADD CONSTRAINT chk_negocios_cupo CHECK (limite_sucursales_activas >= 1),
        ADD CONSTRAINT chk_negocios_rfc CHECK (rfc IS NULL OR CHAR_LENGTH(TRIM(rfc)) > 0),
        ADD CONSTRAINT chk_negocios_correo_administrador CHECK (
          correo_administrador IS NULL OR (
            BINARY correo_administrador = BINARY LOWER(TRIM(correo_administrador))
            AND CHAR_LENGTH(correo_administrador) > 0
          )
        )
    `);

    // La invitación tiene estado propio; pendiente significa que aún no existe cuenta.
    await queryRunner.query(`
      CREATE TABLE altas_administrador (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        negocio_id INT UNSIGNED NOT NULL,
        correo VARCHAR(150) NOT NULL,
        estado ENUM('pendiente','activada') NOT NULL DEFAULT 'pendiente',
        usuario_creado_id INT UNSIGNED NULL,
        creado_en DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        activado_en DATETIME(6) NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uq_altas_administrador_negocio (negocio_id),
        UNIQUE KEY uq_altas_administrador_negocio_id (negocio_id, id),
        CONSTRAINT fk_altas_negocio FOREIGN KEY (negocio_id) REFERENCES negocios(id),
        CONSTRAINT fk_altas_usuario FOREIGN KEY (negocio_id, usuario_creado_id)
          REFERENCES usuarios(negocio_id, id),
        CONSTRAINT chk_altas_correo CHECK (
          BINARY correo = BINARY LOWER(TRIM(correo)) AND CHAR_LENGTH(correo) > 0
        ),
        CONSTRAINT chk_altas_estado CHECK (
          (estado = 'pendiente' AND usuario_creado_id IS NULL AND activado_en IS NULL)
          OR (estado = 'activada' AND usuario_creado_id IS NOT NULL
            AND activado_en IS NOT NULL AND activado_en >= creado_en)
        )
      ) ENGINE=InnoDB
    `);

    // La reserva compartida impone un correo único y exactamente un titular.
    await queryRunner.query(`
      CREATE TABLE correos_acceso (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        correo VARCHAR(150) NOT NULL,
        alta_administrador_id INT UNSIGNED NULL,
        usuario_id INT UNSIGNED NULL,
        creado_en DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY uq_correos_acceso_correo (correo),
        UNIQUE KEY uq_correos_acceso_alta (alta_administrador_id),
        UNIQUE KEY uq_correos_acceso_usuario (usuario_id),
        CONSTRAINT fk_correos_acceso_alta FOREIGN KEY (alta_administrador_id)
          REFERENCES altas_administrador(id),
        CONSTRAINT fk_correos_acceso_usuario FOREIGN KEY (usuario_id)
          REFERENCES usuarios(id),
        CONSTRAINT chk_correos_acceso_correo CHECK (
          BINARY correo = BINARY LOWER(TRIM(correo)) AND CHAR_LENGTH(correo) > 0
        ),
        CONSTRAINT chk_correos_acceso_titular CHECK (
          (alta_administrador_id IS NOT NULL AND usuario_id IS NULL)
          OR (alta_administrador_id IS NULL AND usuario_id IS NOT NULL)
        )
      ) ENGINE=InnoDB
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Revierte solo el tramo nuevo; las tablas históricas quedan intactas.
    await queryRunner.query('DROP TABLE correos_acceso');
    await queryRunner.query('DROP TABLE altas_administrador');
    await queryRunner.query(`
      ALTER TABLE negocios
        DROP CONSTRAINT chk_negocios_correo_administrador,
        DROP CONSTRAINT chk_negocios_rfc,
        DROP CONSTRAINT chk_negocios_cupo,
        DROP COLUMN limite_sucursales_activas,
        DROP COLUMN correo_administrador,
        DROP COLUMN rfc
    `);
  }
}
