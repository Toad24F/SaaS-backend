import type { MigrationInterface, QueryRunner } from 'typeorm';
import { rellenarIdentidadClientes } from '../../clientes/identidad-clientes.persistencia';

/** Calcula la identidad de fichas existentes sin fusionarlas ni tocar citas. */
export class RellenarIdentidadClientes1760000051000 implements MigrationInterface {
  name = 'RellenarIdentidadClientes1760000051000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await rellenarIdentidadClientes(queryRunner.manager);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Solo se retira el dato derivado. La ortografía original permite volver a calcularlo.
    await queryRunner.query('UPDATE clientes SET nombre_normalizado=NULL WHERE nombre_normalizado IS NOT NULL');
  }
}
