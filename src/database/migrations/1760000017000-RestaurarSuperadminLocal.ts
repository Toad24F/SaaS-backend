import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Restaura la cuenta de desarrollo desde variables locales, sin guardar el hash en Git. */
export class RestaurarSuperadminLocal1760000017000 implements MigrationInterface {
  name = 'RestaurarSuperadminLocal1760000017000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const claves = [
      'SUPERADMIN_SEED_ID', 'SUPERADMIN_SEED_NOMBRE', 'SUPERADMIN_SEED_EMAIL',
      'SUPERADMIN_SEED_PASSWORD_HASH', 'SUPERADMIN_SEED_ACTIVADO_EN',
      'SUPERADMIN_SEED_CREADO_EN', 'SUPERADMIN_SEED_CORREO_VERSION',
    ] as const;
    const presentes = claves.filter((clave) => process.env[clave] !== undefined);
    // Las instalaciones y bases de prueba sin respaldo no reciben una cuenta implícita.
    if (presentes.length === 0) return;
    if (presentes.length !== claves.length || claves.some((clave) => !process.env[clave])) {
      throw new Error('Respaldo local del superadmin incompleto.');
    }

    const id = Number(process.env.SUPERADMIN_SEED_ID);
    const version = Number(process.env.SUPERADMIN_SEED_CORREO_VERSION);
    const email = process.env.SUPERADMIN_SEED_EMAIL!;
    if (!Number.isSafeInteger(id) || id < 1 || !Number.isSafeInteger(version) || version < 1 ||
      email !== email.trim().toLowerCase()) {
      throw new Error('Metadatos inválidos en el respaldo local del superadmin.');
    }
    await queryRunner.query(`INSERT INTO usuarios
      (id, negocio_id, nombre, email, password_hash, rol, activo,
       activado_en, creado_en, correo_version)
      VALUES (?, NULL, ?, ?, ?, 'superadmin', 1, ?, ?, ?)`, [
      id, process.env.SUPERADMIN_SEED_NOMBRE, email,
      process.env.SUPERADMIN_SEED_PASSWORD_HASH,
      process.env.SUPERADMIN_SEED_ACTIVADO_EN,
      process.env.SUPERADMIN_SEED_CREADO_EN, version,
    ]);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const id = Number(process.env.SUPERADMIN_SEED_ID);
    if (!Number.isSafeInteger(id) || id < 1) return;
    await queryRunner.query(`DELETE FROM usuarios WHERE id = ? AND rol = 'superadmin'
      AND email = ?`, [id, process.env.SUPERADMIN_SEED_EMAIL]);
  }
}
