import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Citas con intervalo UTC fijo y relaciones operativas del mismo negocio. */
export class CitasCanonicas1760000021000 implements MigrationInterface {
  name = 'CitasCanonicas1760000021000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // El fin persistido no se deriva del catálogo: editar duración no cambia una cita.
    await queryRunner.query(`CREATE TABLE citas (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      negocio_id INT UNSIGNED NOT NULL,
      sucursal_id INT UNSIGNED NOT NULL,
      personal_id INT UNSIGNED NOT NULL,
      servicio_id INT UNSIGNED NOT NULL,
      cliente_id INT UNSIGNED NOT NULL,
      inicio_utc DATETIME(3) NOT NULL,
      fin_utc DATETIME(3) NOT NULL,
      zona_horaria_reserva VARCHAR(64) NOT NULL,
      estado ENUM('pendiente','confirmada','completada','cancelada','no_asistio')
        NOT NULL DEFAULT 'pendiente',
      motivo_consulta TEXT NULL,
      folio VARCHAR(20) NOT NULL,
      origen ENUM('portal_publico','manual') NOT NULL DEFAULT 'portal_publico',
      creado_en DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      PRIMARY KEY (id),
      UNIQUE KEY uq_citas_negocio_id (negocio_id, id),
      UNIQUE KEY uq_citas_folio (folio),
      INDEX idx_citas_personal_inicio (negocio_id, personal_id, inicio_utc),
      INDEX idx_citas_sucursal_inicio (negocio_id, sucursal_id, inicio_utc),
      INDEX idx_citas_cliente (negocio_id, cliente_id),
      INDEX idx_citas_servicio (negocio_id, servicio_id),
      CONSTRAINT fk_citas_negocio FOREIGN KEY (negocio_id)
        REFERENCES negocios(id) ON DELETE RESTRICT,
      CONSTRAINT fk_citas_sucursal FOREIGN KEY (negocio_id, sucursal_id)
        REFERENCES sucursales(negocio_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_citas_personal FOREIGN KEY (negocio_id, personal_id)
        REFERENCES personal(negocio_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_citas_servicio FOREIGN KEY (negocio_id, servicio_id)
        REFERENCES servicios(negocio_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_citas_cliente FOREIGN KEY (negocio_id, cliente_id)
        REFERENCES clientes(negocio_id, id) ON DELETE RESTRICT,
      CONSTRAINT chk_citas_intervalo CHECK (fin_utc > inicio_utc),
      CONSTRAINT chk_citas_zona CHECK (CHAR_LENGTH(TRIM(zona_horaria_reserva)) > 0)
    ) ENGINE=InnoDB`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE citas');
  }
}
