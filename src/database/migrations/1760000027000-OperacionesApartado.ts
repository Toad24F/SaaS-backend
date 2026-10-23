import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Registro durable de cada intento de reemplazar o conceder un apartado. */
export class OperacionesApartado1760000027000 implements MigrationInterface {
  name = 'OperacionesApartado1760000027000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // La clave se deduplica dentro de la sesión; la selección queda fija para reintentos.
    await queryRunner.query(`CREATE TABLE operaciones_apartado (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      negocio_id INT UNSIGNED NOT NULL,
      sesion_id INT UNSIGNED NOT NULL,
      clave VARCHAR(64) NOT NULL,
      generacion BIGINT UNSIGNED NOT NULL,
      seleccion_hash CHAR(64) NOT NULL,
      personal_id INT UNSIGNED NOT NULL,
      sucursal_id INT UNSIGNED NOT NULL,
      servicio_id INT UNSIGNED NOT NULL,
      fecha_local DATE NOT NULL,
      hora_inicio TIME(0) NOT NULL,
      estado ENUM('preparada','concedida','rechazada','sustituida')
        NOT NULL DEFAULT 'preparada',
      apartado_id INT UNSIGNED NULL,
      causa_publica VARCHAR(64) NULL,
      creado_en DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      actualizado_en DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
        ON UPDATE CURRENT_TIMESTAMP(6),
      PRIMARY KEY (id),
      UNIQUE KEY uq_oa_negocio_id (negocio_id, id),
      UNIQUE KEY uq_oa_sesion_clave (negocio_id, sesion_id, clave),
      INDEX idx_oa_apartado (negocio_id, apartado_id),
      CONSTRAINT fk_oa_sesion FOREIGN KEY (negocio_id, sesion_id)
        REFERENCES sesiones_reserva_publica(negocio_id, id) ON DELETE RESTRICT,
      CONSTRAINT chk_oa_seleccion_hash CHECK (CHAR_LENGTH(seleccion_hash) = 64)
    ) ENGINE=InnoDB`);
    // Las referencias a oferta y apartado se completan al cerrar el ciclo en T014.
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE operaciones_apartado');
  }
}
