import type { MigrationInterface, QueryRunner } from 'typeorm';

/** T16: una licencia anual por tenant, sin modalidad ni plan persistidos. */
export class CrearLicencias1760000001000 implements MigrationInterface {
  name = 'CrearLicencias1760000001000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE licencias (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        negocio_id INT UNSIGNED NOT NULL,
        habilitada_en DATETIME(6) NULL,
        vence_en DATETIME(6) NULL,
        suspendida_en DATETIME(6) NULL,
        creado_en DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        actualizado_en DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
          ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY uq_licencias_negocio (negocio_id),
        UNIQUE KEY uq_licencias_negocio_id (negocio_id, id),
        INDEX idx_licencias_vencimiento (suspendida_en, vence_en),
        CONSTRAINT fk_licencias_negocio FOREIGN KEY (negocio_id)
          REFERENCES negocios(id),
        CONSTRAINT chk_licencias_vigencia CHECK (
          (habilitada_en IS NULL AND vence_en IS NULL)
          OR (
            habilitada_en IS NOT NULL AND vence_en IS NOT NULL
            AND vence_en > habilitada_en
          )
        ),
        CONSTRAINT chk_licencias_habilitacion CHECK (
          habilitada_en IS NULL OR habilitada_en >= creado_en
        ),
        CONSTRAINT chk_licencias_suspension CHECK (
          suspendida_en IS NULL OR (
            suspendida_en >= creado_en
            AND (
              habilitada_en IS NULL
              OR (suspendida_en >= habilitada_en AND suspendida_en < vence_en)
            )
          )
        )
      ) ENGINE=InnoDB
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE licencias');
  }
}
