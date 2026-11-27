import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Cierra la etapa aditiva solo después de conciliar todas las identidades activas. */
export class IdentidadActivaClientes1760000053000 implements MigrationInterface {
  name = 'IdentidadActivaClientes1760000053000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const [sinClave] = await queryRunner.query(`SELECT id FROM clientes
      WHERE fusionado_en_id IS NULL AND nombre_normalizado IS NULL LIMIT 1`);
    if (sinClave) throw new Error('Hay fichas activas sin normalizar; complete el relleno antes del índice.');
    const [duplicado] = await queryRunner.query(`SELECT negocio_id FROM clientes
      WHERE fusionado_en_id IS NULL
      GROUP BY negocio_id, nombre_normalizado, telefono
      HAVING COUNT(*) > 1 LIMIT 1`);
    if (duplicado) throw new Error('Hay fichas activas duplicadas; concilie cada grupo antes del índice.');
    // NULL en la columna generada excluye únicamente las fichas absorbidas del índice único.
    await queryRunner.query(`ALTER TABLE clientes
      ADD nombre_activo VARBINARY(1800)
        GENERATED ALWAYS AS (IF(fusionado_en_id IS NULL, nombre_normalizado, NULL)) PERSISTENT,
      ADD CONSTRAINT chk_clientes_clave_activa CHECK (fusionado_en_id IS NOT NULL OR nombre_normalizado IS NOT NULL),
      ADD UNIQUE KEY uq_clientes_identidad_activa (negocio_id,nombre_activo,telefono)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE clientes
      DROP INDEX uq_clientes_identidad_activa,
      DROP CONSTRAINT chk_clientes_clave_activa,
      DROP COLUMN nombre_activo`);
  }
}
