import type { MigrationInterface, QueryRunner } from 'typeorm';

/** El perfil comparte PK con la cuenta; las relaciones compuestas bloquean cruces entre negocios. */
export class Profesionales1760000012000 implements MigrationInterface {
  name = 'Profesionales1760000012000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE personal (
      id INT UNSIGNED NOT NULL,
      negocio_id INT UNSIGNED NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_personal_negocio_id (negocio_id, id),
      CONSTRAINT fk_personal_negocio FOREIGN KEY (negocio_id)
        REFERENCES negocios(id) ON DELETE RESTRICT,
      CONSTRAINT fk_personal_usuario FOREIGN KEY (negocio_id, id)
        REFERENCES usuarios(negocio_id, id) ON DELETE RESTRICT
    ) ENGINE=InnoDB`);
    // La triple PK impide duplicados; ambas FKs incluyen negocio_id.
    await queryRunner.query(`CREATE TABLE personal_sucursales (
      negocio_id INT UNSIGNED NOT NULL,
      personal_id INT UNSIGNED NOT NULL,
      sucursal_id INT UNSIGNED NOT NULL,
      PRIMARY KEY (negocio_id, personal_id, sucursal_id),
      INDEX idx_ps_sucursal (negocio_id, sucursal_id),
      CONSTRAINT fk_ps_perfil FOREIGN KEY (negocio_id, personal_id)
        REFERENCES personal(negocio_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_ps_sucursal FOREIGN KEY (negocio_id, sucursal_id)
        REFERENCES sucursales(negocio_id, id) ON DELETE RESTRICT
    ) ENGINE=InnoDB`);
    await queryRunner.query(`CREATE TABLE personal_servicios (
      negocio_id INT UNSIGNED NOT NULL,
      personal_id INT UNSIGNED NOT NULL,
      servicio_id INT UNSIGNED NOT NULL,
      PRIMARY KEY (negocio_id, personal_id, servicio_id),
      INDEX idx_pserv_servicio (negocio_id, servicio_id),
      CONSTRAINT fk_pserv_perfil FOREIGN KEY (negocio_id, personal_id)
        REFERENCES personal(negocio_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_pserv_servicio FOREIGN KEY (negocio_id, servicio_id)
        REFERENCES servicios(negocio_id, id) ON DELETE RESTRICT
    ) ENGINE=InnoDB`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Orden inverso respeta las dependencias; no se ejecuta al desplegar.
    await queryRunner.query('DROP TABLE personal_servicios');
    await queryRunner.query('DROP TABLE personal_sucursales');
    await queryRunner.query('DROP TABLE personal');
  }
}
