import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Agrega límites y visibilidad con defaults que preservan filas anteriores. */
export class CuposVisibilidadNegocio1760000034000 implements MigrationInterface {
  name = 'CuposVisibilidadNegocio1760000034000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE negocios
      ADD limite_profesionales_activos INT UNSIGNED NOT NULL DEFAULT 5,
      ADD limite_recepcionistas_activos INT UNSIGNED NOT NULL DEFAULT 3,
      ADD mostrar_precios_publicos TINYINT(1) NOT NULL DEFAULT 1,
      ADD CONSTRAINT chk_negocios_limite_profesionales CHECK (limite_profesionales_activos >= 1),
      ADD CONSTRAINT chk_negocios_limite_recepcionistas CHECK (limite_recepcionistas_activos >= 1),
      ADD CONSTRAINT chk_negocios_mostrar_precios CHECK (mostrar_precios_publicos IN (0, 1))`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE negocios
      DROP CONSTRAINT chk_negocios_mostrar_precios,
      DROP CONSTRAINT chk_negocios_limite_recepcionistas,
      DROP CONSTRAINT chk_negocios_limite_profesionales,
      DROP COLUMN mostrar_precios_publicos,
      DROP COLUMN limite_recepcionistas_activos,
      DROP COLUMN limite_profesionales_activos`);
  }
}
