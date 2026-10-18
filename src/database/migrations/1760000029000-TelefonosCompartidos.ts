import type { MigrationInterface, QueryRunner } from 'typeorm';

/** El teléfono deja de identificar de forma única a una persona del negocio. */
export class TelefonosCompartidos1760000029000 implements MigrationInterface {
  name = 'TelefonosCompartidos1760000029000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Solo cambia el índice; IDs, clientes y FKs existentes permanecen intactos.
    await queryRunner.query(`ALTER TABLE clientes
      DROP INDEX uq_cliente_por_negocio,
      ADD INDEX idx_cliente_por_negocio_telefono (negocio_id, telefono)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE clientes
      DROP INDEX idx_cliente_por_negocio_telefono,
      ADD UNIQUE INDEX uq_cliente_por_negocio (negocio_id, telefono)`);
  }
}
