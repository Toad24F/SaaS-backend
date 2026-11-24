import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Persiste cortes ligados al actor y una proyección histórica sin datos de contacto. */
export class CortesReporte1760000066000 implements MigrationInterface {
  name = 'CortesReporte1760000066000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE cortes_reporte (
        id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
        negocio_id INT UNSIGNED NOT NULL,
        actor_usuario_id INT UNSIGNED NOT NULL,
        filtros JSON NOT NULL,
        fecha_corte DATETIME(3) NOT NULL,
        expira_en DATETIME(3) NOT NULL,
        completo BOOLEAN NOT NULL DEFAULT FALSE,
        PRIMARY KEY (id),
        INDEX idx_cr_actor (negocio_id,actor_usuario_id),
        INDEX idx_cr_expira (expira_en),
        CONSTRAINT fk_cr_actor FOREIGN KEY (negocio_id,actor_usuario_id)
          REFERENCES usuarios(negocio_id,id) ON DELETE RESTRICT,
        CONSTRAINT chk_cr_expira CHECK (expira_en = DATE_ADD(fecha_corte, INTERVAL 1 DAY)),
        CONSTRAINT chk_cr_completo CHECK (completo IN (0,1))
      ) ENGINE=InnoDB`);
    await queryRunner.query(`CREATE TABLE filas_corte_reporte (
        corte_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
        cita_id INT UNSIGNED NOT NULL,
        sucursal_id INT UNSIGNED NOT NULL,
        personal_id INT UNSIGNED NOT NULL,
        servicio_id INT UNSIGNED NOT NULL,
        nombre_sucursal VARCHAR(150) NULL,
        nombre_profesional VARCHAR(150) NULL,
        nombre_servicio VARCHAR(150) NULL,
        fecha_civil DATE NOT NULL,
        inicio_utc DATETIME(3) NOT NULL,
        fin_utc DATETIME(3) NOT NULL,
        estado ENUM('pendiente','confirmada','completada','cancelada','no_asistio') NOT NULL,
        origen ENUM('portal_publico','manual') NOT NULL,
        costo_aceptado DECIMAL(10,2) NULL,
        causa_cancelacion ENUM('falta_confirmacion_plazo') NULL,
        PRIMARY KEY (corte_id,cita_id),
        INDEX idx_fcr_orden (corte_id,fecha_civil,inicio_utc,cita_id),
        CONSTRAINT fk_fcr_corte FOREIGN KEY (corte_id) REFERENCES cortes_reporte(id) ON DELETE CASCADE
      ) ENGINE=InnoDB`);
    // El corte permite altas solo durante su materialización y conserva sus filas publicadas.
    await queryRunner.query(`CREATE TRIGGER trg_fcr_no_actualizar BEFORE UPDATE ON filas_corte_reporte
      FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='La fila del corte es inmutable'`);
    await queryRunner.query(`CREATE TRIGGER trg_fcr_no_borrar BEFORE DELETE ON filas_corte_reporte
      FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='La fila del corte es inmutable'`);
    await queryRunner.query(`CREATE TRIGGER trg_fcr_corte_abierto BEFORE INSERT ON filas_corte_reporte
      FOR EACH ROW SET NEW.corte_id = (
        SELECT id FROM cortes_reporte WHERE id=NEW.corte_id AND completo=0 FOR UPDATE
      )`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Al retirar las tablas derivadas quedan intactas las citas y sus snapshots originales.
    await queryRunner.query('DROP TABLE filas_corte_reporte');
    await queryRunner.query('DROP TABLE cortes_reporte');
  }
}
