import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Vincula cada clave nueva de unión con el contenido que autorizó su actor. */
export class HuellaUnionCliente1760000052000 implements MigrationInterface {
  name = 'HuellaUnionCliente1760000052000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Las filas históricas no permiten reconstruir una propuesta. Se conservan con huella nula.
    await queryRunner.query(`ALTER TABLE uniones_cliente
      ADD contenido_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
      ADD CONSTRAINT chk_uc_contenido_hash CHECK (contenido_hash IS NULL OR contenido_hash REGEXP '^[0-9a-f]{64}$')`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const [uso] = await queryRunner.query('SELECT id FROM uniones_cliente WHERE contenido_hash IS NOT NULL LIMIT 1');
    if (uso) throw new Error('No se puede retirar la huella de las uniones registradas.');
    await queryRunner.query('ALTER TABLE uniones_cliente DROP CONSTRAINT chk_uc_contenido_hash, DROP COLUMN contenido_hash');
  }
}
