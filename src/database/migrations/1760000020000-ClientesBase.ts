import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Base referencial del cliente; su captura y consulta pública pertenecen al módulo 3. */
export class ClientesBase1760000020000 implements MigrationInterface {
  name = 'ClientesBase1760000020000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // La clave compuesta permite exigir pertenencia al crear una cita.
    await queryRunner.query(`CREATE TABLE clientes (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      negocio_id INT UNSIGNED NOT NULL,
      nombre_completo VARCHAR(150) NOT NULL,
      telefono VARCHAR(10) NOT NULL,
      email VARCHAR(150) NULL,
      creado_en DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      PRIMARY KEY (id),
      UNIQUE KEY uq_clientes_negocio_id (negocio_id, id),
      UNIQUE KEY uq_cliente_por_negocio (negocio_id, telefono),
      CONSTRAINT fk_clientes_negocio FOREIGN KEY (negocio_id)
        REFERENCES negocios(id) ON DELETE RESTRICT,
      CONSTRAINT chk_clientes_nombre CHECK (CHAR_LENGTH(TRIM(nombre_completo)) > 0),
      CONSTRAINT chk_clientes_telefono CHECK (CHAR_LENGTH(telefono) = 10)
    ) ENGINE=InnoDB`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE clientes');
  }
}
