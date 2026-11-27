import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Amplía contacto sin reescribir los diez dígitos mexicanos ni snapshots históricos. */
export class TelefonosInternacionales1760000069000 implements MigrationInterface {
  name = 'TelefonosInternacionales1760000069000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE clientes
      DROP CONSTRAINT chk_clientes_telefono,
      MODIFY telefono VARCHAR(16) NOT NULL,
      ADD CONSTRAINT chk_clientes_telefono CHECK
        (telefono REGEXP '^([0-9]{10}|[+][1-9][0-9]{6,14})$')`);
    await queryRunner.query('ALTER TABLE citas MODIFY telefono_contacto VARCHAR(16) NULL');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const [extranjero] = await queryRunner.query(`SELECT id FROM clientes
      WHERE telefono LIKE '+%' LIMIT 1`);
    const [cita] = await queryRunner.query(`SELECT id FROM citas
      WHERE CHAR_LENGTH(telefono_contacto) > 10 LIMIT 1`);
    if (extranjero || cita) throw new Error('Hay teléfonos internacionales; corrija hacia delante.');
    await queryRunner.query('ALTER TABLE citas MODIFY telefono_contacto VARCHAR(10) NULL');
    await queryRunner.query(`ALTER TABLE clientes DROP CONSTRAINT chk_clientes_telefono,
      MODIFY telefono VARCHAR(10) NOT NULL,
      ADD CONSTRAINT chk_clientes_telefono CHECK (CHAR_LENGTH(telefono) = 10)`);
  }
}
