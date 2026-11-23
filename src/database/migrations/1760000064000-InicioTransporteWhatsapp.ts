import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Distingue una toma recuperable de otra que pudo haber contactado a Meta. */
export class InicioTransporteWhatsapp1760000064000 implements MigrationInterface {
  name = 'InicioTransporteWhatsapp1760000064000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE envios_whatsapp
      ADD COLUMN inicio_transporte_en DATETIME(3) NULL AFTER arrendado_hasta,
      ADD CONSTRAINT chk_ew_inicio_transporte CHECK (
        inicio_transporte_en IS NULL OR (estado='en_proceso' AND intentos > 0))`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Quitar la marca con intentos abiertos permitiría reclamar un envío posiblemente aceptado.
    const abiertos: unknown[] = await queryRunner.query(
      'SELECT id FROM envios_whatsapp WHERE inicio_transporte_en IS NOT NULL LIMIT 1');
    if (abiertos.length) throw new Error('Hay envíos WhatsApp con transporte iniciado.');
    await queryRunner.query(`ALTER TABLE envios_whatsapp
      DROP CONSTRAINT chk_ew_inicio_transporte, DROP COLUMN inicio_transporte_en`);
  }
}
