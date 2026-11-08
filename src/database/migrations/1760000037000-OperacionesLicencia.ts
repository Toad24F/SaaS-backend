import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Registra una única operación por clave, licencia y negocio. */
export class OperacionesLicencia1760000037000 implements MigrationInterface {
  name = 'OperacionesLicencia1760000037000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE operaciones_licencia (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      negocio_id INT UNSIGNED NOT NULL,
      licencia_id INT UNSIGNED NOT NULL,
      actor_id INT UNSIGNED NOT NULL,
      clave VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      accion ENUM('suspender','reactivar','renovar') NOT NULL,
      parametros_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      resultado_reducido TEXT NOT NULL,
      creado_en DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      PRIMARY KEY (id),
      UNIQUE KEY uq_operaciones_licencia_clave (negocio_id,licencia_id,clave),
      UNIQUE KEY uq_operaciones_licencia_referencia (negocio_id,licencia_id,id),
      INDEX idx_operaciones_licencia_actor (actor_id),
      CONSTRAINT fk_operaciones_licencia_licencia FOREIGN KEY (negocio_id,licencia_id)
        REFERENCES licencias(negocio_id,id),
      CONSTRAINT fk_operaciones_licencia_actor FOREIGN KEY (actor_id)
        REFERENCES usuarios(id),
      CONSTRAINT chk_operaciones_licencia_clave CHECK (
        CHAR_LENGTH(clave) BETWEEN 16 AND 64 AND BINARY clave = BINARY TRIM(clave)),
      CONSTRAINT chk_operaciones_licencia_hash CHECK (CHAR_LENGTH(parametros_hash) = 64),
      CONSTRAINT chk_operaciones_licencia_resultado CHECK (JSON_VALID(resultado_reducido))
    ) ENGINE=InnoDB`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE operaciones_licencia');
  }
}
