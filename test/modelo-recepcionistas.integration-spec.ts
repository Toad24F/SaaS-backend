import { randomUUID } from 'node:crypto';
import { conBaseMigrada } from './support/mariadb';

// La migración se aplica solo a una base desechable: comprueba que la base
// también rechaza estados pendientes de recepción y propósitos retirados.
describe('Modelo objetivo de recepción en MariaDB (T80)', () => {
  it('admite administrador pendiente y exige credenciales completas a recepción', async () => {
    await conBaseMigrada(async (db) => {
      const sufijo = randomUUID();
      const negocio = await db.query(
        'INSERT INTO negocios (nombre, slug, email_contacto) VALUES (?, ?, ?)',
        ['Modelo T80', `modelo-${sufijo}`, `${sufijo}@example.test`],
      );
      const negocioId = Number(negocio.insertId);
      await expect(db.query(
        'INSERT INTO usuarios (negocio_id, email, rol) VALUES (?, ?, ?)',
        [negocioId, `pendiente-${sufijo}@example.test`, 'admin_negocio'],
      )).resolves.toBeDefined();
      await expect(db.query(
        'INSERT INTO usuarios (negocio_id, email, rol) VALUES (?, ?, ?)',
        [negocioId, `recepcion-${sufijo}@example.test`, 'recepcionista'],
      )).rejects.toBeDefined();
      await expect(db.query(
        `INSERT INTO usuarios (negocio_id, nombre, email, password_hash, rol, activado_en)
         VALUES (?, 'Recepción', ?, NULL, 'recepcionista', UTC_TIMESTAMP(6))`,
        [negocioId, `sin-hash-${sufijo}@example.test`],
      )).rejects.toBeDefined();
      await expect(db.query(
        'INSERT INTO usuarios (email, rol) VALUES (?, ?)',
        [`super-pendiente-${sufijo}@example.test`, 'superadmin'],
      )).rejects.toBeDefined();
      await expect(db.query(
        `INSERT INTO usuarios (negocio_id, nombre, email, password_hash, rol, activado_en)
         VALUES (?, 'Recepción', ?, 'hash-de-prueba', 'recepcionista', UTC_TIMESTAMP(6))`,
        [negocioId, `completa-${sufijo}@example.test`],
      )).resolves.toBeDefined();
    });
  });

  it('rechaza el propósito retirado aun con destinatario, emisor y hash válidos', async () => {
    await conBaseMigrada(async (db) => {
      const sufijo = randomUUID();
      const negocio = await db.query(
        'INSERT INTO negocios (nombre, slug, email_contacto) VALUES (?, ?, ?)',
        ['Modelo código', `codigo-${sufijo}`, `${sufijo}@example.test`],
      );
      const negocioId = Number(negocio.insertId);
      const destinatario = await db.query(
        'INSERT INTO usuarios (negocio_id, email, rol) VALUES (?, ?, ?)',
        [negocioId, `admin-${sufijo}@example.test`, 'admin_negocio'],
      );
      const emisor = await db.query(
        `INSERT INTO usuarios (nombre, email, password_hash, rol, activado_en)
         VALUES ('Superadmin', ?, 'hash-de-prueba', 'superadmin', UTC_TIMESTAMP(6))`,
        [`super-${sufijo}@example.test`],
      );
      await expect(db.query(
        `INSERT INTO codigos_acceso
         (negocio_id, usuario_id, emisor_usuario_id, proposito, codigo_hash, expira_en)
         VALUES (?, ?, ?, 'activacion_recepcionista', ?, DATE_ADD(UTC_TIMESTAMP(6), INTERVAL 48 HOUR))`,
        [negocioId, Number(destinatario.insertId), Number(emisor.insertId), 'a'.repeat(64)],
      )).rejects.toBeDefined();
      expect(await db.query('SELECT id FROM codigos_acceso')).toHaveLength(0);
    });
  });
});
