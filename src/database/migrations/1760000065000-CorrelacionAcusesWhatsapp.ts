import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Permite reconstruir la identidad del mensaje desde un acuse firmado. */
export class CorrelacionAcusesWhatsapp1760000065000 implements MigrationInterface {
  name = 'CorrelacionAcusesWhatsapp1760000065000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE envios_whatsapp
      ADD COLUMN correlacion_proveedor CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL AFTER inicio_transporte_en,
      ADD UNIQUE KEY uq_ew_correlacion (negocio_id, correlacion_proveedor)`);
    await queryRunner.query(`ALTER TABLE eventos_whatsapp
      ADD COLUMN correlacion_proveedor CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL AFTER mensaje_externo_id`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const abiertos: unknown[] = await queryRunner.query(`SELECT id FROM envios_whatsapp
      WHERE correlacion_proveedor IS NOT NULL AND estado IN ('en_proceso', 'incierto') LIMIT 1`);
    if (abiertos.length) throw new Error('Hay intentos de WhatsApp pendientes de conciliación.');
    await queryRunner.query('ALTER TABLE eventos_whatsapp DROP COLUMN correlacion_proveedor');
    await queryRunner.query('ALTER TABLE envios_whatsapp DROP INDEX uq_ew_correlacion, DROP COLUMN correlacion_proveedor');
  }
}
