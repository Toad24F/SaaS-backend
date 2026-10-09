import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Prepara el perfil, catálogo y preferencias individuales sin reinterpretar estados globales. */
export class OfertaIndividual1760000018000 implements MigrationInterface {
  name = 'OfertaIndividual1760000018000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Los datos heredados carecen de estos valores; la API exigirá especialidad en la próxima edición.
    await queryRunner.query('ALTER TABLE personal ADD especialidad VARCHAR(150) NULL');
    await queryRunner.query(`ALTER TABLE servicios
      ADD descripcion TEXT NULL,
      ADD creador_personal_id INT UNSIGNED NULL,
      ADD INDEX idx_servicios_creador (negocio_id, creador_personal_id),
      ADD CONSTRAINT fk_servicios_creador FOREIGN KEY (negocio_id, creador_personal_id)
        REFERENCES personal(negocio_id, id) ON DELETE RESTRICT`);

    // DEFAULT TRUE mantiene las selecciones y asignaciones previas como activas.
    await queryRunner.query(`ALTER TABLE personal_servicios
      ADD activo BOOLEAN NOT NULL DEFAULT TRUE,
      ADD CONSTRAINT chk_pserv_activo CHECK (activo IN (0, 1))`);
    await queryRunner.query(`ALTER TABLE personal_sucursales
      ADD activo BOOLEAN NOT NULL DEFAULT TRUE,
      ADD CONSTRAINT chk_ps_activo CHECK (activo IN (0, 1))`);

    // Ambas referencias compuestas exigen una selección y una asignación del mismo negocio.
    await queryRunner.query(`CREATE TABLE personal_servicios_sucursales (
      negocio_id INT UNSIGNED NOT NULL,
      personal_id INT UNSIGNED NOT NULL,
      sucursal_id INT UNSIGNED NOT NULL,
      servicio_id INT UNSIGNED NOT NULL,
      activo BOOLEAN NOT NULL DEFAULT TRUE,
      PRIMARY KEY (negocio_id, personal_id, sucursal_id, servicio_id),
      INDEX idx_pss_servicio (negocio_id, personal_id, servicio_id),
      CONSTRAINT fk_pss_asignacion FOREIGN KEY (negocio_id, personal_id, sucursal_id)
        REFERENCES personal_sucursales(negocio_id, personal_id, sucursal_id) ON DELETE RESTRICT,
      CONSTRAINT fk_pss_seleccion FOREIGN KEY (negocio_id, personal_id, servicio_id)
        REFERENCES personal_servicios(negocio_id, personal_id, servicio_id) ON DELETE RESTRICT,
      CONSTRAINT chk_pss_activo CHECK (activo IN (0, 1))
    ) ENGINE=InnoDB`);

    // El producto de selecciones y asignaciones preserva preferencias incluso con estados globales inactivos.
    await queryRunner.query(`INSERT INTO personal_servicios_sucursales
      (negocio_id, personal_id, sucursal_id, servicio_id, activo)
      SELECT seleccion.negocio_id, seleccion.personal_id, asignacion.sucursal_id,
        seleccion.servicio_id, TRUE
      FROM personal_servicios seleccion
      INNER JOIN personal_sucursales asignacion
        ON asignacion.negocio_id = seleccion.negocio_id
        AND asignacion.personal_id = seleccion.personal_id`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Se retira primero la tabla dependiente y después sus columnas de origen.
    await queryRunner.query('DROP TABLE personal_servicios_sucursales');
    await queryRunner.query('ALTER TABLE personal_sucursales DROP CONSTRAINT chk_ps_activo, DROP COLUMN activo');
    await queryRunner.query('ALTER TABLE personal_servicios DROP CONSTRAINT chk_pserv_activo, DROP COLUMN activo');
    await queryRunner.query(`ALTER TABLE servicios
      DROP FOREIGN KEY fk_servicios_creador,
      DROP INDEX idx_servicios_creador,
      DROP COLUMN creador_personal_id,
      DROP COLUMN descripcion`);
    await queryRunner.query('ALTER TABLE personal DROP COLUMN especialidad');
  }
}
