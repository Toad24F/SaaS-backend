import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Agrega el catálogo del negocio con restricciones de importe, duración y pertenencia. */
export class Servicios1760000011000 implements MigrationInterface {
  name = 'Servicios1760000011000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // La clave compuesta prepara FKs de selecciones futuras sin permitir cruces de tenant.
    await queryRunner.query(`CREATE TABLE servicios (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      negocio_id INT UNSIGNED NOT NULL,
      nombre VARCHAR(150) NOT NULL,
      costo DECIMAL(10,2) NOT NULL,
      duracion_minutos INT UNSIGNED NOT NULL,
      activo BOOLEAN NOT NULL DEFAULT TRUE,
      creado_en DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      PRIMARY KEY (id),
      UNIQUE KEY uq_servicios_negocio_id (negocio_id, id),
      INDEX idx_servicios_negocio_activo (negocio_id, activo),
      CONSTRAINT fk_servicios_negocio FOREIGN KEY (negocio_id)
        REFERENCES negocios(id) ON DELETE RESTRICT,
      CONSTRAINT chk_servicios_nombre CHECK (CHAR_LENGTH(TRIM(nombre)) > 0),
      CONSTRAINT chk_servicios_costo CHECK (costo >= 0),
      CONSTRAINT chk_servicios_duracion CHECK (duracion_minutos > 0),
      CONSTRAINT chk_servicios_activo CHECK (activo IN (0, 1))
    ) ENGINE=InnoDB`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE servicios');
  }
}
