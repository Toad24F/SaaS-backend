import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Agrega separación cero sin convertir el intervalo público heredado. */
export class SeparacionAgenda1760000039000 implements MigrationInterface {
  name = 'SeparacionAgenda1760000039000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE configuracion_agenda
      ADD tiempo_entre_citas_minutos INT UNSIGNED NOT NULL DEFAULT 0,
      ADD CONSTRAINT chk_agenda_tiempo_entre_citas CHECK (
        tiempo_entre_citas_minutos BETWEEN 0 AND 60
        AND tiempo_entre_citas_minutos MOD 5 = 0)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const [uso] = await queryRunner.query(`SELECT COUNT(*) total FROM configuracion_agenda
      WHERE tiempo_entre_citas_minutos <> 0`);
    if (Number(uso.total) > 0) {
      throw new Error('No se puede retirar una separación configurada sin perder datos.');
    }
    await queryRunner.query(`ALTER TABLE configuracion_agenda
      DROP CONSTRAINT chk_agenda_tiempo_entre_citas,
      DROP COLUMN tiempo_entre_citas_minutos`);
  }
}
