import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Instala franjas semanales con borradores y asignación obligatoria si hay sucursal. */
export class HorariosSemanales1760000013000 implements MigrationInterface {
  name = 'HorariosSemanales1760000013000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE horarios_personal (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      negocio_id INT UNSIGNED NOT NULL,
      personal_id INT UNSIGNED NOT NULL,
      dia_semana TINYINT UNSIGNED NOT NULL,
      orden INT UNSIGNED NOT NULL DEFAULT 0,
      sucursal_id INT UNSIGNED NULL,
      inicio_minutos INT UNSIGNED NULL,
      fin_minutos INT UNSIGNED NULL,
      descanso_inicio_minutos INT UNSIGNED NULL,
      descanso_fin_minutos INT UNSIGNED NULL,
      activo BOOLEAN NOT NULL DEFAULT FALSE,
      PRIMARY KEY (id),
      UNIQUE KEY uq_horarios_negocio_id (negocio_id, id),
      INDEX idx_horarios_personal_dia_orden (negocio_id, personal_id, dia_semana, orden),
      INDEX idx_horarios_asignacion (negocio_id, personal_id, sucursal_id),
      CONSTRAINT fk_horarios_personal FOREIGN KEY (negocio_id, personal_id)
        REFERENCES personal(negocio_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_horarios_asignacion FOREIGN KEY (negocio_id, personal_id, sucursal_id)
        REFERENCES personal_sucursales(negocio_id, personal_id, sucursal_id) ON DELETE RESTRICT,
      CONSTRAINT chk_horarios_dia CHECK (dia_semana BETWEEN 0 AND 6),
      CONSTRAINT chk_horarios_orden CHECK (orden >= 0),
      CONSTRAINT chk_horarios_activo CHECK (activo IN (0, 1)),
      CONSTRAINT chk_horarios_limites CHECK (
        (inicio_minutos IS NULL OR inicio_minutos BETWEEN 0 AND 1439)
        AND (fin_minutos IS NULL OR fin_minutos BETWEEN 1 AND 1440)
        AND (descanso_inicio_minutos IS NULL OR descanso_inicio_minutos BETWEEN 0 AND 1439)
        AND (descanso_fin_minutos IS NULL OR descanso_fin_minutos BETWEEN 1 AND 1440)),
      CONSTRAINT chk_horarios_pares CHECK (
        (inicio_minutos IS NULL OR fin_minutos IS NULL OR inicio_minutos < fin_minutos)
        AND (descanso_inicio_minutos IS NULL OR descanso_fin_minutos IS NULL
          OR descanso_inicio_minutos < descanso_fin_minutos)),
      CONSTRAINT chk_horarios_completos CHECK (activo = 0 OR (
        sucursal_id IS NOT NULL AND inicio_minutos IS NOT NULL AND fin_minutos IS NOT NULL
        AND inicio_minutos < fin_minutos
        AND ((descanso_inicio_minutos IS NULL AND descanso_fin_minutos IS NULL)
          OR (descanso_inicio_minutos IS NOT NULL AND descanso_fin_minutos IS NOT NULL
            AND descanso_inicio_minutos >= inicio_minutos
            AND descanso_inicio_minutos < descanso_fin_minutos
            AND descanso_fin_minutos <= fin_minutos))))
    ) ENGINE=InnoDB`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Reversión explícita; las excepciones deben retirarse antes si están instaladas.
    await queryRunner.query('DROP TABLE horarios_personal');
  }
}
