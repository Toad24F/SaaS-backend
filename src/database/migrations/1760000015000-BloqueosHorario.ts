import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Bloqueos independientes con referencias compuestas al mismo negocio. */
export class BloqueosHorario1760000015000 implements MigrationInterface {
  name = 'BloqueosHorario1760000015000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE bloqueos_horario (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      negocio_id INT UNSIGNED NOT NULL,
      personal_id INT UNSIGNED NULL,
      sucursal_id INT UNSIGNED NULL,
      creador_usuario_id INT UNSIGNED NOT NULL,
      tipo VARCHAR(30) NOT NULL,
      motivo VARCHAR(500) NOT NULL,
      fecha_inicio DATE NOT NULL,
      fecha_fin DATE NOT NULL,
      inicio_minutos INT UNSIGNED NULL,
      fin_minutos INT UNSIGNED NULL,
      creado_en DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      PRIMARY KEY (id),
      UNIQUE KEY uq_bloqueos_negocio_id (negocio_id, id),
      INDEX idx_bloqueos_profesional_fechas (negocio_id, personal_id, fecha_inicio, fecha_fin),
      INDEX idx_bloqueos_sucursal_fechas (negocio_id, sucursal_id, fecha_inicio, fecha_fin),
      CONSTRAINT fk_bloqueos_negocio FOREIGN KEY (negocio_id)
        REFERENCES negocios(id) ON DELETE RESTRICT,
      CONSTRAINT fk_bloqueos_personal FOREIGN KEY (negocio_id, personal_id)
        REFERENCES personal(negocio_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_bloqueos_sucursal FOREIGN KEY (negocio_id, sucursal_id)
        REFERENCES sucursales(negocio_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_bloqueos_creador FOREIGN KEY (negocio_id, creador_usuario_id)
        REFERENCES usuarios(negocio_id, id) ON DELETE RESTRICT,
      CONSTRAINT chk_bloqueos_tipo CHECK (tipo IN ('vacaciones','dia_festivo','emergencia')),
      CONSTRAINT chk_bloqueos_motivo CHECK (CHAR_LENGTH(TRIM(motivo)) > 0),
      CONSTRAINT chk_bloqueos_fechas CHECK (fecha_inicio <= fecha_fin),
      CONSTRAINT chk_bloqueos_horas CHECK (
        (inicio_minutos IS NULL AND fin_minutos IS NULL) OR
        (inicio_minutos BETWEEN 0 AND 1439 AND fin_minutos BETWEEN 1 AND 1440
          AND (fecha_inicio < fecha_fin OR inicio_minutos < fin_minutos)))
    ) ENGINE=InnoDB`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE bloqueos_horario');
  }
}
