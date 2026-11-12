import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Una marca común retira cuentas y oferta sin eliminar identidad ni relaciones. */
export class InhabilitacionRecursos1760000035000 implements MigrationInterface {
  name = 'InhabilitacionRecursos1760000035000';

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const tabla of ['usuarios', 'servicios', 'sucursales']) {
      await queryRunner.query(`ALTER TABLE ${tabla}
        ADD inhabilitado_en DATETIME(6) NULL,
        ADD CONSTRAINT chk_${tabla}_inhabilitado_inactivo
          CHECK (inhabilitado_en IS NULL OR activo = 0)`);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const tabla of ['sucursales', 'servicios', 'usuarios']) {
      await queryRunner.query(`ALTER TABLE ${tabla}
        DROP CONSTRAINT chk_${tabla}_inhabilitado_inactivo,
        DROP COLUMN inhabilitado_en`);
    }
  }
}
