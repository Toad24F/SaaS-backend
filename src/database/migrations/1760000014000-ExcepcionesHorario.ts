import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Una cabecera única por fecha/sucursal distingue cierre explícito de ausencia. */
export class ExcepcionesHorario1760000014000 implements MigrationInterface {
  name = 'ExcepcionesHorario1760000014000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE excepciones_horario (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      negocio_id INT UNSIGNED NOT NULL,
      personal_id INT UNSIGNED NOT NULL,
      sucursal_id INT UNSIGNED NOT NULL,
      fecha_local DATE NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_excepciones_negocio_id (negocio_id, id),
      UNIQUE KEY uq_excepciones_profesional_sucursal_fecha
        (negocio_id, personal_id, sucursal_id, fecha_local),
      CONSTRAINT fk_excepciones_personal FOREIGN KEY (negocio_id, personal_id)
        REFERENCES personal(negocio_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_excepciones_asignacion FOREIGN KEY (negocio_id, personal_id, sucursal_id)
        REFERENCES personal_sucursales(negocio_id, personal_id, sucursal_id) ON DELETE RESTRICT
    ) ENGINE=InnoDB`);
    // No se exige una hija: cero franjas representa explícitamente un día sin atención.
    await queryRunner.query(`CREATE TABLE franjas_excepcion_horario (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      negocio_id INT UNSIGNED NOT NULL,
      excepcion_id INT UNSIGNED NOT NULL,
      orden INT UNSIGNED NOT NULL DEFAULT 0,
      inicio_minutos INT UNSIGNED NOT NULL,
      fin_minutos INT UNSIGNED NOT NULL,
      descanso_inicio_minutos INT UNSIGNED NULL,
      descanso_fin_minutos INT UNSIGNED NULL,
      PRIMARY KEY (id),
      INDEX idx_franjas_excepcion_orden (negocio_id, excepcion_id, orden),
      CONSTRAINT fk_franjas_excepcion FOREIGN KEY (negocio_id, excepcion_id)
        REFERENCES excepciones_horario(negocio_id, id) ON DELETE RESTRICT,
      CONSTRAINT chk_franjas_excepcion_orden CHECK (orden >= 0),
      CONSTRAINT chk_franjas_excepcion_intervalo CHECK (
        inicio_minutos BETWEEN 0 AND 1439 AND fin_minutos BETWEEN 1 AND 1440
        AND inicio_minutos < fin_minutos),
      CONSTRAINT chk_franjas_excepcion_descanso CHECK (
        (descanso_inicio_minutos IS NULL AND descanso_fin_minutos IS NULL)
        OR (descanso_inicio_minutos IS NOT NULL AND descanso_fin_minutos IS NOT NULL
          AND descanso_inicio_minutos >= inicio_minutos
          AND descanso_inicio_minutos < descanso_fin_minutos
          AND descanso_fin_minutos <= fin_minutos))
    ) ENGINE=InnoDB`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE franjas_excepcion_horario');
    await queryRunner.query('DROP TABLE excepciones_horario');
  }
}
