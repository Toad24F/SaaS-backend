import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Configuración versionada por negocio; los defaults no reescriben citas previas. */
export class ConfiguracionAutomatizaciones1760000054000 implements MigrationInterface {
  name = 'ConfiguracionAutomatizaciones1760000054000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE configuracion_automatizaciones (
      negocio_id INT UNSIGNED NOT NULL,
      version INT UNSIGNED NOT NULL DEFAULT 1,
      plazo_confirmacion_horas TINYINT UNSIGNED NOT NULL DEFAULT 12,
      recordatorio_horas TINYINT UNSIGNED NOT NULL DEFAULT 24,
      PRIMARY KEY (negocio_id),
      CONSTRAINT fk_ca_negocio FOREIGN KEY (negocio_id) REFERENCES negocios(id) ON DELETE RESTRICT,
      CONSTRAINT chk_ca_version CHECK (version >= 1),
      CONSTRAINT chk_ca_plazo CHECK (plazo_confirmacion_horas BETWEEN 6 AND 24),
      CONSTRAINT chk_ca_recordatorio CHECK (recordatorio_horas BETWEEN 12 AND 48)
    ) ENGINE=InnoDB`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const [uso] = await queryRunner.query('SELECT COUNT(*) total FROM configuracion_automatizaciones');
    if (Number(uso.total)) throw new Error('No se puede retirar configuración de automatizaciones en uso.');
    await queryRunner.query('DROP TABLE configuracion_automatizaciones');
  }
}
