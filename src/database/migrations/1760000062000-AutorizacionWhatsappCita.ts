import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Conserva las generaciones previas sin autorización; no crea envíos retroactivos. */
export class AutorizacionWhatsappCita1760000062000 implements MigrationInterface {
  name = 'AutorizacionWhatsappCita1760000062000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE condiciones_confirmacion_cita
      ADD contacto_autorizado TINYINT NOT NULL DEFAULT 0,
      ADD CONSTRAINT chk_ccc_contacto_autorizado CHECK (contacto_autorizado IN (0,1))`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // El downgrade retira solo la constancia añadida por esta migración.
    await queryRunner.query(`ALTER TABLE condiciones_confirmacion_cita
      DROP CONSTRAINT chk_ccc_contacto_autorizado, DROP COLUMN contacto_autorizado`);
  }
}
