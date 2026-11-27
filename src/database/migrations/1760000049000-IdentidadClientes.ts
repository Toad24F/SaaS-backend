import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Añade campos de transición compatibles con las fichas y escritores previos. */
export class IdentidadClientes1760000049000 implements MigrationInterface {
  name = 'IdentidadClientes1760000049000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // NFC puede expandir caracteres. Los 150 puntos originales caben aun con expansión UTF-8.
    await queryRunner.query(`ALTER TABLE clientes
      ADD nombre_normalizado VARBINARY(1800) NULL,
      ADD fusionado_en_id INT UNSIGNED NULL,
      ADD INDEX idx_clientes_fusion (negocio_id,fusionado_en_id),
      ADD CONSTRAINT fk_clientes_fusion FOREIGN KEY (negocio_id,fusionado_en_id)
        REFERENCES clientes(negocio_id,id) ON DELETE RESTRICT`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const [uso] = await queryRunner.query('SELECT id FROM clientes WHERE fusionado_en_id IS NOT NULL LIMIT 1');
    if (uso) throw new Error('No se pueden retirar las referencias de fichas fusionadas.');
    await queryRunner.query(`ALTER TABLE clientes
      DROP FOREIGN KEY fk_clientes_fusion,
      DROP INDEX idx_clientes_fusion, DROP COLUMN fusionado_en_id, DROP COLUMN nombre_normalizado`);
  }
}
