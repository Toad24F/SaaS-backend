import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Una cita puede conservar generaciones vencidas; ninguna fila se retroasigna al migrar. */
export class CondicionesConfirmacionCita1760000055000 implements MigrationInterface {
  name = 'CondicionesConfirmacionCita1760000055000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE condiciones_confirmacion_cita (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      negocio_id INT UNSIGNED NOT NULL,
      cita_id INT UNSIGNED NOT NULL,
      generacion INT UNSIGNED NOT NULL,
      categoria ENUM('normal','proxima','manual_heredada') NOT NULL,
      instante_base DATETIME(3) NOT NULL,
      plazo_aplicado_minutos SMALLINT UNSIGNED NULL,
      vencimiento_utc DATETIME(3) NULL,
      motivo_seguimiento VARCHAR(500) NULL,
      estado_politica ENUM('pendiente','confirmada','seguimiento_manual','cancelada','anulada') NOT NULL DEFAULT 'pendiente',
      version_configuracion INT UNSIGNED NULL,
      confirmado_en DATETIME(3) NULL,
      origen_confirmacion ENUM('personal','whatsapp') NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_ccc_negocio_cita_generacion (negocio_id,cita_id,generacion),
      UNIQUE KEY uq_ccc_referencia_vigente (negocio_id,cita_id,generacion,id),
      INDEX idx_ccc_vencimiento (estado_politica,vencimiento_utc),
      CONSTRAINT fk_ccc_cita FOREIGN KEY (negocio_id,cita_id) REFERENCES citas(negocio_id,id) ON DELETE RESTRICT,
      CONSTRAINT chk_ccc_generacion CHECK (generacion >= 1),
      CONSTRAINT chk_ccc_plazo CHECK (plazo_aplicado_minutos IS NULL OR plazo_aplicado_minutos > 0),
      CONSTRAINT chk_ccc_vencimiento CHECK (vencimiento_utc IS NULL OR plazo_aplicado_minutos IS NOT NULL),
      CONSTRAINT chk_ccc_confirmacion CHECK ((confirmado_en IS NULL AND origen_confirmacion IS NULL)
        OR (confirmado_en IS NOT NULL AND origen_confirmacion IS NOT NULL))
    ) ENGINE=InnoDB`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const [uso] = await queryRunner.query('SELECT COUNT(*) total FROM condiciones_confirmacion_cita');
    if (Number(uso.total)) throw new Error('No se pueden retirar generaciones de cita en uso.');
    await queryRunner.query('DROP TABLE condiciones_confirmacion_cita');
  }
}
