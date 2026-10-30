import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Crea el predecesor antes del puntero, dejando ambas referencias anulables. */
export class SucesionIntentos1760000042000 implements MigrationInterface {
  name = 'SucesionIntentos1760000042000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE intentos_reserva_publica
      ADD intento_anterior_id BIGINT UNSIGNED NULL,
      ADD UNIQUE KEY uq_irp_intento_anterior (negocio_id,intento_anterior_id),
      ADD CONSTRAINT fk_irp_intento_anterior
        FOREIGN KEY (negocio_id,intento_anterior_id)
        REFERENCES intentos_reserva_publica(negocio_id,id) ON DELETE RESTRICT`);
    // El apartado ya existe cuando se prepara el primer intento; su puntero nace nulo.
    await queryRunner.query(`ALTER TABLE bloqueos_temporales
      ADD intento_actual_id BIGINT UNSIGNED NULL,
      ADD INDEX idx_bt_intento_actual (negocio_id,intento_actual_id),
      ADD CONSTRAINT fk_bt_intento_actual
        FOREIGN KEY (negocio_id,intento_actual_id)
        REFERENCES intentos_reserva_publica(negocio_id,id) ON DELETE RESTRICT`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const [punteros] = await queryRunner.query(`SELECT COUNT(*) total FROM bloqueos_temporales
      WHERE intento_actual_id IS NOT NULL`);
    const [sucesores] = await queryRunner.query(`SELECT COUNT(*) total FROM intentos_reserva_publica
      WHERE intento_anterior_id IS NOT NULL`);
    if (Number(punteros.total) > 0 || Number(sucesores.total) > 0) {
      throw new Error('No se puede retirar la sucesión de intentos sin perder datos.');
    }
    await queryRunner.query(`ALTER TABLE bloqueos_temporales
      DROP FOREIGN KEY fk_bt_intento_actual,
      DROP INDEX idx_bt_intento_actual,
      DROP COLUMN intento_actual_id`);
    await queryRunner.query(`ALTER TABLE intentos_reserva_publica
      DROP FOREIGN KEY fk_irp_intento_anterior,
      DROP INDEX uq_irp_intento_anterior,
      DROP COLUMN intento_anterior_id`);
  }
}
