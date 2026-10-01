import { conBaseMigrada } from './support/mariadb';

describe('M1-T013: migración incremental de identidad en MariaDB temporal', () => {
  it('añade columnas y tablas sin tocar las cuatro migraciones históricas', async () => {
    await conBaseMigrada(async (db) => {
      const migraciones = await db.query('SELECT name FROM migrations ORDER BY id');
      // Se conserva el orden histórico aunque se agreguen migraciones posteriores.
      // Perfiles y relaciones suman una migración incremental al historial.
      expect(migraciones).toHaveLength(13);
      expect(migraciones[4].name).toContain('IdentidadPendiente');
      const columnas = await db.query(`SELECT COLUMN_NAME AS nombre FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'negocios'`);
      expect(columnas.map((fila: { nombre: string }) => fila.nombre)).toEqual(
        expect.arrayContaining(['rfc', 'correo_administrador', 'limite_sucursales_activas']),
      );
      const tablas = await db.query(`SELECT TABLE_NAME AS nombre FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE()`);
      expect(tablas.map((fila: { nombre: string }) => fila.nombre)).toEqual(
        expect.arrayContaining(['altas_administrador', 'correos_acceso']),
      );
      expect(await db.runMigrations()).toEqual([]);
    });
  });

  it('aplica cupo predeterminado, admite RFC repetido y rechaza cupo inválido', async () => {
    await conBaseMigrada(async (db) => {
      await db.query(`INSERT INTO negocios
        (nombre, slug, email_contacto, rfc, correo_administrador)
        VALUES ('Uno', 'uno', 'uno@example.test', 'XAXX010101000', 'admin1@example.test')`);
      await db.query(`INSERT INTO negocios
        (nombre, slug, email_contacto, rfc, correo_administrador)
        VALUES ('Dos', 'dos', 'dos@example.test', 'XAXX010101000', 'admin2@example.test')`);
      const filas = await db.query('SELECT limite_sucursales_activas AS cupo FROM negocios');
      expect(filas.map((fila: { cupo: number }) => fila.cupo)).toEqual([1, 1]);
      await expect(db.query('UPDATE negocios SET limite_sucursales_activas = 0 WHERE slug = ?',
        ['uno'])).rejects.toBeDefined();
      await expect(db.query('UPDATE negocios SET limite_sucursales_activas = -1 WHERE slug = ?',
        ['uno'])).rejects.toBeDefined();
    });
  });

  it('permite invitación sin cuenta y reserva un correo para un único titular', async () => {
    await conBaseMigrada(async (db) => {
      const uno = await db.query(`INSERT INTO negocios (nombre, slug, email_contacto)
        VALUES ('Uno', 'uno', 'uno@example.test')`);
      const dos = await db.query(`INSERT INTO negocios (nombre, slug, email_contacto)
        VALUES ('Dos', 'dos', 'dos@example.test')`);
      const alta = await db.query(`INSERT INTO altas_administrador (negocio_id, correo)
        VALUES (?, 'admin@example.test')`, [uno.insertId]);
      expect((await db.query('SELECT usuario_creado_id FROM altas_administrador WHERE id = ?',
        [alta.insertId]))[0].usuario_creado_id).toBeNull();
      await db.query(`INSERT INTO correos_acceso (correo, alta_administrador_id)
        VALUES ('admin@example.test', ?)`, [alta.insertId]);
      await expect(db.query(`INSERT INTO correos_acceso (correo, alta_administrador_id)
        VALUES ('admin@example.test', ?)`, [alta.insertId])).rejects.toBeDefined();
      await expect(db.query(`INSERT INTO correos_acceso (correo, alta_administrador_id)
        VALUES (' ADMIN@example.test ', ?)`, [alta.insertId])).rejects.toBeDefined();
      const otraAlta = await db.query(`INSERT INTO altas_administrador (negocio_id, correo)
        VALUES (?, 'otro@example.test')`, [dos.insertId]);
      await expect(db.query(`INSERT INTO correos_acceso (correo, alta_administrador_id)
        VALUES ('admin@example.test', ?)`, [otraAlta.insertId])).rejects.toBeDefined();
      await expect(db.query(`INSERT INTO correos_acceso (correo)
        VALUES ('sin-titular@example.test')`)).rejects.toBeDefined();
      await expect(db.query(`INSERT INTO correos_acceso (correo, alta_administrador_id, usuario_id)
        VALUES ('doble@example.test', ?, 999)`, [alta.insertId])).rejects.toBeDefined();
      await expect(db.query(`INSERT INTO altas_administrador (negocio_id, correo)
        VALUES (?, 'otro@example.test')`, [uno.insertId])).rejects.toBeDefined();
      // Una cuenta posterior de otro negocio no puede apropiarse de la invitación.
      const ajeno = await db.query(`INSERT INTO usuarios
        (negocio_id, nombre, email, password_hash, rol, activado_en)
        VALUES (?, 'Admin', 'ajeno@example.test', 'hash', 'admin_negocio', UTC_TIMESTAMP(6))`,
      [dos.insertId]);
      await expect(db.query(`UPDATE altas_administrador
        SET estado = 'activada', usuario_creado_id = ?, activado_en = UTC_TIMESTAMP(6)
        WHERE id = ?`, [ajeno.insertId, alta.insertId])).rejects.toBeDefined();
    });
  });

  it('revierte solo la migración nueva y permite aplicarla otra vez', async () => {
    await conBaseMigrada(async (db) => {
      // Retrocede las migraciones posteriores, incluidas sucursales, servicios y perfiles.
      for (let indice = 0; indice < 9; indice += 1) await db.undoLastMigration();
      const tablas = await db.query(`SELECT TABLE_NAME AS nombre FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE()`);
      const nombres = tablas.map((fila: { nombre: string }) => fila.nombre);
      expect(nombres).toContain('usuarios');
      expect(nombres).not.toContain('altas_administrador');
      expect(nombres).not.toContain('correos_acceso');
      expect(await db.runMigrations()).toHaveLength(9);
    });
  });
});
