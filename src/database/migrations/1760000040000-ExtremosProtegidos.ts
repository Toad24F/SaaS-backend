import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Conserva extremos históricos de citas y no adivina condiciones de apartados. */
export class ExtremosProtegidos1760000040000 implements MigrationInterface {
  name = 'ExtremosProtegidos1760000040000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE citas
      ADD separacion_minutos INT UNSIGNED NOT NULL DEFAULT 0,
      ADD fin_ocupacion_utc DATETIME(3) NULL,
      ADD CONSTRAINT chk_citas_separacion CHECK (
        separacion_minutos BETWEEN 0 AND 60 AND separacion_minutos MOD 5 = 0),
      ADD CONSTRAINT chk_citas_fin_ocupacion CHECK (
        fin_ocupacion_utc IS NULL OR
        fin_ocupacion_utc = DATE_ADD(fin_utc, INTERVAL separacion_minutos MINUTE))`);
    // El intervalo antiguo no protegía margen adicional: el final histórico coincide.
    await queryRunner.query('UPDATE citas SET fin_ocupacion_utc = fin_utc WHERE fin_ocupacion_utc IS NULL');
    await queryRunner.query(`ALTER TABLE bloqueos_temporales
      ADD separacion_minutos INT UNSIGNED NULL,
      ADD fin_ocupacion_utc DATETIME(3) NULL,
      ADD modo_concesion VARCHAR(20) NULL,
      ADD version_reglas INT UNSIGNED NULL,
      ADD CONSTRAINT chk_bt_contexto_protegido CHECK (COALESCE((
        (fin_ocupacion_utc IS NULL AND separacion_minutos IS NULL
          AND modo_concesion IS NULL AND version_reglas IS NULL)
        OR (fin_ocupacion_utc IS NOT NULL AND separacion_minutos IS NOT NULL
          AND modo_concesion IS NOT NULL AND version_reglas IS NOT NULL
          AND separacion_minutos BETWEEN 0 AND 60 AND separacion_minutos MOD 5 = 0
          AND modo_concesion IN ('ventana_libre','agenda_compacta')
          AND version_reglas >= 1)
      ), 0)),
      ADD CONSTRAINT chk_bt_fin_ocupacion CHECK (
        fin_ocupacion_utc IS NULL OR
        fin_ocupacion_utc = DATE_ADD(fin_utc, INTERVAL separacion_minutos MINUTE))`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const [apartados] = await queryRunner.query(`SELECT COUNT(*) total FROM bloqueos_temporales
      WHERE fin_ocupacion_utc IS NOT NULL OR separacion_minutos IS NOT NULL
        OR modo_concesion IS NOT NULL OR version_reglas IS NOT NULL`);
    const [citas] = await queryRunner.query(`SELECT COUNT(*) total FROM citas
      WHERE separacion_minutos <> 0 OR fin_ocupacion_utc <> fin_utc`);
    if (Number(apartados.total) > 0 || Number(citas.total) > 0) {
      throw new Error('No se puede retirar contexto protegido sin perder datos.');
    }
    await queryRunner.query(`ALTER TABLE bloqueos_temporales
      DROP CONSTRAINT chk_bt_fin_ocupacion,
      DROP CONSTRAINT chk_bt_contexto_protegido,
      DROP COLUMN version_reglas,
      DROP COLUMN modo_concesion,
      DROP COLUMN fin_ocupacion_utc,
      DROP COLUMN separacion_minutos`);
    await queryRunner.query(`ALTER TABLE citas
      DROP CONSTRAINT chk_citas_fin_ocupacion,
      DROP CONSTRAINT chk_citas_separacion,
      DROP COLUMN fin_ocupacion_utc,
      DROP COLUMN separacion_minutos`);
  }
}
