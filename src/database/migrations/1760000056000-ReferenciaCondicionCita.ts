import type { MigrationInterface, QueryRunner } from 'typeorm';

/** La FK incluye negocio, cita y generación; una condición ajena nunca puede ser vigente. */
export class ReferenciaCondicionCita1760000056000 implements MigrationInterface {
  name = 'ReferenciaCondicionCita1760000056000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE citas
      ADD generacion_automatizacion INT UNSIGNED NULL,
      ADD condicion_vigente_id BIGINT UNSIGNED NULL,
      ADD causa_cancelacion ENUM('falta_confirmacion_plazo') NULL,
      ADD INDEX idx_citas_condicion_vigente (negocio_id,id,generacion_automatizacion,condicion_vigente_id),
      ADD CONSTRAINT chk_citas_condicion_vigente CHECK (
        (generacion_automatizacion IS NULL AND condicion_vigente_id IS NULL)
        OR (generacion_automatizacion >= 1 AND condicion_vigente_id IS NOT NULL)),
      ADD CONSTRAINT chk_citas_causa_cancelacion CHECK (causa_cancelacion IS NULL OR estado='cancelada'),
      ADD CONSTRAINT fk_citas_condicion_vigente FOREIGN KEY
        (negocio_id,id,generacion_automatizacion,condicion_vigente_id)
        REFERENCES condiciones_confirmacion_cita(negocio_id,cita_id,generacion,id) ON DELETE RESTRICT`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const [uso] = await queryRunner.query(`SELECT COUNT(*) total FROM citas
      WHERE condicion_vigente_id IS NOT NULL OR causa_cancelacion IS NOT NULL`);
    if (Number(uso.total)) throw new Error('No se puede retirar la condición vigente de citas en uso.');
    await queryRunner.query(`ALTER TABLE citas
      DROP FOREIGN KEY fk_citas_condicion_vigente,
      DROP CONSTRAINT chk_citas_condicion_vigente,
      DROP CONSTRAINT chk_citas_causa_cancelacion,
      DROP INDEX idx_citas_condicion_vigente,
      DROP COLUMN generacion_automatizacion,
      DROP COLUMN condicion_vigente_id,
      DROP COLUMN causa_cancelacion`);
  }
}
