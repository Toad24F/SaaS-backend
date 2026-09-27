import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Amplía los roles y ata cada reserva al correo real de su titular. */
export class CuentasProfesionales1760000005000 implements MigrationInterface {
  name = 'CuentasProfesionales1760000005000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // El alta histórica de admin sigue operativa hasta sustituirla en T035.
    await queryRunner.query('ALTER TABLE usuarios DROP CONSTRAINT chk_usuarios_rol_negocio');
    await queryRunner.query(`ALTER TABLE usuarios MODIFY COLUMN rol
      ENUM('superadmin','admin_negocio','recepcionista','profesional') NOT NULL`);
    await queryRunner.query(`ALTER TABLE usuarios ADD CONSTRAINT chk_usuarios_rol_negocio CHECK (
      (rol = 'superadmin' AND negocio_id IS NULL)
      OR (rol IN ('admin_negocio','recepcionista','profesional') AND negocio_id IS NOT NULL)
    )`);
    await queryRunner.query(`ALTER TABLE usuarios
      ADD UNIQUE KEY uq_usuarios_id_email (id, email)`);
    await queryRunner.query(`ALTER TABLE altas_administrador
      ADD UNIQUE KEY uq_altas_id_correo (id, correo)`);
    await queryRunner.query(`ALTER TABLE correos_acceso
      ADD CONSTRAINT fk_correos_acceso_usuario_correo FOREIGN KEY (usuario_id, correo)
        REFERENCES usuarios(id, email),
      ADD CONSTRAINT fk_correos_acceso_alta_correo FOREIGN KEY (alta_administrador_id, correo)
        REFERENCES altas_administrador(id, correo)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Solo se revierte sobre una base sin cuentas Profesional.
    await queryRunner.query(`ALTER TABLE correos_acceso
      DROP FOREIGN KEY fk_correos_acceso_usuario_correo,
      DROP FOREIGN KEY fk_correos_acceso_alta_correo`);
    await queryRunner.query('ALTER TABLE altas_administrador DROP INDEX uq_altas_id_correo');
    await queryRunner.query('ALTER TABLE usuarios DROP INDEX uq_usuarios_id_email');
    await queryRunner.query('ALTER TABLE usuarios DROP CONSTRAINT chk_usuarios_rol_negocio');
    await queryRunner.query(`ALTER TABLE usuarios MODIFY COLUMN rol
      ENUM('superadmin','admin_negocio','recepcionista') NOT NULL`);
    await queryRunner.query(`ALTER TABLE usuarios ADD CONSTRAINT chk_usuarios_rol_negocio CHECK (
      (rol = 'superadmin' AND negocio_id IS NULL)
      OR (rol IN ('admin_negocio','recepcionista') AND negocio_id IS NOT NULL)
    )`);
  }
}
