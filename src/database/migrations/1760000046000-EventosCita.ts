import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Historial por revisión con identidad de personal o sesión pública comprobable. */
export class EventosCita1760000046000 implements MigrationInterface {
  name = 'EventosCita1760000046000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // No se inventa historia para citas previas. Cada cambio futuro insertará otra fila.
    await queryRunner.query(`CREATE TABLE eventos_cita (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      negocio_id INT UNSIGNED NOT NULL,
      cita_id INT UNSIGNED NOT NULL,
      actor_usuario_id INT UNSIGNED NULL,
      sesion_publica_id INT UNSIGNED NULL,
      accion ENUM('alta','cambio_estado','cancelacion','reactivacion','cambio_horario') NOT NULL,
      ocurrido_en DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      version_resultante INT UNSIGNED NOT NULL,
      valores_antes JSON NULL,
      valores_despues JSON NOT NULL,
      motivo VARCHAR(2000) NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_ec_negocio_id (negocio_id,id),
      UNIQUE KEY uq_ec_cita_version (negocio_id,cita_id,version_resultante),
      CONSTRAINT chk_ec_actor CHECK (
        (actor_usuario_id IS NOT NULL AND sesion_publica_id IS NULL)
        OR (actor_usuario_id IS NULL AND sesion_publica_id IS NOT NULL)),
      CONSTRAINT chk_ec_origen_publico CHECK (sesion_publica_id IS NULL OR accion='alta'),
      CONSTRAINT chk_ec_version CHECK (version_resultante >= 1)
    ) ENGINE=InnoDB`);
    // Triggers de una sola sentencia: también funcionan en el SQL de instalación sin DELIMITER.
    await queryRunner.query(`CREATE TRIGGER trg_ec_no_actualizar BEFORE UPDATE ON eventos_cita
      FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='El historial de citas es inmutable.'`);
    await queryRunner.query(`CREATE TRIGGER trg_ec_no_borrar BEFORE DELETE ON eventos_cita
      FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='El historial de citas es inmutable.'`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Comprobar uso antes de tocar triggers: ALTER/DROP no tienen rollback en MariaDB.
    const [uso] = await queryRunner.query('SELECT COUNT(*) total FROM eventos_cita');
    if (Number(uso.total) > 0) throw new Error('No se puede retirar el historial de citas sin perder datos.');
    await queryRunner.query('DROP TRIGGER trg_ec_no_borrar');
    await queryRunner.query('DROP TRIGGER trg_ec_no_actualizar');
    await queryRunner.query('DROP TABLE eventos_cita');
  }
}
