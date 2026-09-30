import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Añade sucursales sin alterar negocios, usuarios, licencias ni datos históricos. */
export class Sucursales1760000010000 implements MigrationInterface {
  name = 'Sucursales1760000010000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // El índice por estado prepara el recuento de cupo; la clave compuesta
    // permite a futuras relaciones demostrar pertenencia al mismo negocio.
    await queryRunner.query(`CREATE TABLE sucursales (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      negocio_id INT UNSIGNED NOT NULL,
      nombre VARCHAR(150) NOT NULL,
      direccion VARCHAR(255) NOT NULL,
      telefono VARCHAR(20) NOT NULL,
      zona_horaria VARCHAR(64) NOT NULL,
      url_google_maps VARCHAR(2048) NULL,
      notas_llegada TEXT NULL,
      activo BOOLEAN NOT NULL DEFAULT TRUE,
      creado_en DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      PRIMARY KEY (id),
      UNIQUE KEY uq_sucursales_negocio_id (negocio_id, id),
      INDEX idx_sucursales_negocio_activo (negocio_id, activo),
      CONSTRAINT fk_sucursales_negocio FOREIGN KEY (negocio_id)
        REFERENCES negocios(id) ON DELETE RESTRICT,
      CONSTRAINT chk_sucursales_nombre CHECK (CHAR_LENGTH(TRIM(nombre)) > 0),
      CONSTRAINT chk_sucursales_direccion CHECK (CHAR_LENGTH(TRIM(direccion)) > 0),
      CONSTRAINT chk_sucursales_telefono CHECK (CHAR_LENGTH(TRIM(telefono)) > 0),
      CONSTRAINT chk_sucursales_zona CHECK (CHAR_LENGTH(TRIM(zona_horaria)) > 0)
    ) ENGINE=InnoDB`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // TypeORM solo ejecuta esta reversión de forma explícita; up nunca borra datos.
    await queryRunner.query('DROP TABLE sucursales');
  }
}
