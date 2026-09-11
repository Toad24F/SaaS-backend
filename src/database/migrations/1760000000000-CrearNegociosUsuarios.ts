import type { MigrationInterface, QueryRunner } from 'typeorm';

/** T15: identidad del tenant y cuentas activadas o pendientes. */
export class CrearNegociosUsuarios1760000000000 implements MigrationInterface {
  name = 'CrearNegociosUsuarios1760000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE negocios (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        nombre VARCHAR(150) NOT NULL,
        slug VARCHAR(100) NOT NULL,
        email_contacto VARCHAR(150) NOT NULL,
        telefono_contacto VARCHAR(20) NULL,
        activado_en DATETIME(6) NULL,
        creado_en DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY uq_negocios_slug (slug),
        CONSTRAINT chk_negocios_activacion CHECK (
          activado_en IS NULL OR activado_en >= creado_en
        )
      ) ENGINE=InnoDB
    `);
    await queryRunner.query(`
      CREATE TABLE usuarios (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        negocio_id INT UNSIGNED NULL,
        nombre VARCHAR(150) NULL,
        email VARCHAR(150) NOT NULL,
        password_hash VARCHAR(255) NULL,
        rol ENUM('superadmin','admin_negocio','recepcionista') NOT NULL,
        activo BOOLEAN NOT NULL DEFAULT TRUE,
        activado_en DATETIME(6) NULL,
        creado_en DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        admin_negocio_unico INT UNSIGNED AS (
          CASE WHEN rol = 'admin_negocio' THEN negocio_id ELSE NULL END
        ) STORED,
        PRIMARY KEY (id),
        UNIQUE KEY uq_usuarios_email (email),
        UNIQUE KEY uq_usuario_admin_negocio (admin_negocio_unico),
        UNIQUE KEY uq_usuarios_negocio_id (negocio_id, id),
        CONSTRAINT fk_usuarios_negocio FOREIGN KEY (negocio_id)
          REFERENCES negocios(id),
        CONSTRAINT chk_usuarios_rol_negocio CHECK (
          (rol = 'superadmin' AND negocio_id IS NULL)
          OR (rol IN ('admin_negocio','recepcionista') AND negocio_id IS NOT NULL)
        ),
        CONSTRAINT chk_usuarios_email_normalizado CHECK (
          BINARY email = BINARY LOWER(TRIM(email)) AND CHAR_LENGTH(email) > 0
        ),
        CONSTRAINT chk_usuarios_activo CHECK (activo IN (0, 1)),
        CONSTRAINT chk_usuarios_activacion CHECK (
          (activado_en IS NULL AND nombre IS NULL AND password_hash IS NULL)
          OR (
            activado_en IS NOT NULL
            AND nombre IS NOT NULL AND CHAR_LENGTH(TRIM(nombre)) > 0
            AND password_hash IS NOT NULL AND CHAR_LENGTH(password_hash) > 0
            AND activado_en >= creado_en
          )
        )
      ) ENGINE=InnoDB
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE usuarios');
    await queryRunner.query('DROP TABLE negocios');
  }
}
