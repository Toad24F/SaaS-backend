import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Persiste la identidad y las versiones observadas de cada decisión de unión. */
export class UnionesCliente1760000050000 implements MigrationInterface {
  name = 'UnionesCliente1760000050000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE uniones_cliente (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      negocio_id INT UNSIGNED NOT NULL,
      origen_id INT UNSIGNED NOT NULL,
      destino_id INT UNSIGNED NOT NULL,
      actor_usuario_id INT UNSIGNED NOT NULL,
      version_origen INT UNSIGNED NOT NULL,
      version_destino INT UNSIGNED NOT NULL,
      clave VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      ocurrido_en DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      PRIMARY KEY (id),
      UNIQUE KEY uq_uc_negocio_id (negocio_id,id),
      UNIQUE KEY uq_uc_actor_clave (negocio_id,actor_usuario_id,clave),
      INDEX idx_uc_origen (negocio_id,origen_id),
      INDEX idx_uc_destino (negocio_id,destino_id),
      CONSTRAINT chk_uc_fichas CHECK (origen_id <> destino_id),
      CONSTRAINT chk_uc_versiones CHECK (version_origen >= 1 AND version_destino >= 1),
      CONSTRAINT chk_uc_clave CHECK (CHAR_LENGTH(clave) BETWEEN 16 AND 64 AND BINARY clave = BINARY TRIM(clave)),
      CONSTRAINT fk_uc_negocio FOREIGN KEY (negocio_id)
        REFERENCES negocios(id) ON DELETE RESTRICT,
      CONSTRAINT fk_uc_origen FOREIGN KEY (negocio_id,origen_id)
        REFERENCES clientes(negocio_id,id) ON DELETE RESTRICT,
      CONSTRAINT fk_uc_destino FOREIGN KEY (negocio_id,destino_id)
        REFERENCES clientes(negocio_id,id) ON DELETE RESTRICT,
      CONSTRAINT fk_uc_actor FOREIGN KEY (negocio_id,actor_usuario_id)
        REFERENCES usuarios(negocio_id,id) ON DELETE RESTRICT
    ) ENGINE=InnoDB`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const [uso] = await queryRunner.query('SELECT id FROM uniones_cliente LIMIT 1');
    if (uso) throw new Error('No se puede retirar el historial de uniones de clientes.');
    await queryRunner.query('DROP TABLE uniones_cliente');
  }
}
