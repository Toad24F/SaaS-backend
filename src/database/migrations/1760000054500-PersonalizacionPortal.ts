import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Añade el almacenamiento de marca sin reescribir negocios existentes. */
export class PersonalizacionPortal1760000054500 implements MigrationInterface {
  name = 'PersonalizacionPortal1760000054500';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE recursos_portal (
      negocio_id INT UNSIGNED NOT NULL,
      id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      contenido MEDIUMBLOB NOT NULL,
      mime VARCHAR(10) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      ancho SMALLINT UNSIGNED NOT NULL,
      alto SMALLINT UNSIGNED NOT NULL,
      creado_en DATETIME(6) NOT NULL,
      expira_en DATETIME(6) NOT NULL,
      PRIMARY KEY (negocio_id,id),
      INDEX idx_recursos_portal_expiracion (negocio_id,expira_en),
      CONSTRAINT chk_recursos_portal_mime CHECK (mime IN ('image/png', 'image/jpeg', 'image/webp')),
      CONSTRAINT chk_recursos_portal_dimensiones CHECK (ancho BETWEEN 1 AND 2048 AND alto BETWEEN 1 AND 2048),
      CONSTRAINT chk_recursos_portal_tamano CHECK (OCTET_LENGTH(contenido) BETWEEN 1 AND 2097152),
      CONSTRAINT chk_recursos_portal_expiracion CHECK (expira_en > creado_en),
      CONSTRAINT fk_recursos_portal_negocio FOREIGN KEY (negocio_id)
        REFERENCES negocios(id) ON DELETE RESTRICT
    ) ENGINE=InnoDB`);

    // Primero existen los recursos para poder declarar la FK de publicación.
    await queryRunner.query(`CREATE TABLE personalizacion_portal (
      negocio_id INT UNSIGNED NOT NULL,
      version INT UNSIGNED NOT NULL,
      fondo CHAR(7) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      texto CHAR(7) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      acento CHAR(7) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      logo_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
      creado_en DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      actualizado_en DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
      PRIMARY KEY (negocio_id),
      INDEX idx_personalizacion_portal_logo (negocio_id,logo_id),
      CONSTRAINT chk_personalizacion_portal_version CHECK (version >= 1),
      CONSTRAINT chk_personalizacion_portal_colores CHECK (
        fondo REGEXP '^#[0-9A-Fa-f]{6}$' AND texto REGEXP '^#[0-9A-Fa-f]{6}$' AND acento REGEXP '^#[0-9A-Fa-f]{6}$'),
      CONSTRAINT fk_personalizacion_portal_negocio FOREIGN KEY (negocio_id)
        REFERENCES negocios(id) ON DELETE RESTRICT,
      CONSTRAINT fk_personalizacion_portal_logo FOREIGN KEY (negocio_id,logo_id)
        REFERENCES recursos_portal(negocio_id,id) ON DELETE RESTRICT
    ) ENGINE=InnoDB`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Retirar primero la configuración libera su referencia a los recursos.
    await queryRunner.query('DROP TABLE personalizacion_portal');
    await queryRunner.query('DROP TABLE recursos_portal');
  }
}
