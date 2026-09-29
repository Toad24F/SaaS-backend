import { createHash } from 'node:crypto';
import { conBaseMigrada } from './support/mariadb';

describe('M1-T026: bandeja durable en MariaDB temporal', () => {
  async function datos(db: { query: (sql: string, parametros?: unknown[]) => Promise<any> }) {
    const uno = await db.query(`INSERT INTO negocios (nombre, slug, email_contacto)
      VALUES ('Uno', 'uno', 'uno@example.test')`);
    const dos = await db.query(`INSERT INTO negocios (nombre, slug, email_contacto)
      VALUES ('Dos', 'dos', 'dos@example.test')`);
    const actor = await db.query(`INSERT INTO usuarios
      (nombre, email, password_hash, rol, activado_en)
      VALUES ('Super', 'super@example.test', 'hash', 'superadmin', UTC_TIMESTAMP(6))`);
    const cuenta = await db.query(`INSERT INTO usuarios
      (negocio_id, nombre, email, password_hash, rol, activado_en)
      VALUES (?, 'Admin', 'admin@example.test', 'hash', 'admin_negocio', UTC_TIMESTAMP(6))`,
    [uno.insertId]);
    const codigo = await db.query(`INSERT INTO codigos_acceso
      (negocio_id, usuario_id, emisor_usuario_id, proposito, codigo_hash,
       emitido_en, expira_en, legado_fase_1)
      VALUES (?, ?, ?, 'recuperacion', ?, UTC_TIMESTAMP(6),
        DATE_ADD(UTC_TIMESTAMP(6), INTERVAL 30 MINUTE), 1)`,
    [uno.insertId, cuenta.insertId, actor.insertId,
      createHash('sha256').update('codigo-solo-de-prueba').digest('hex')]);
    return { uno: Number(uno.insertId), dos: Number(dos.insertId), codigo: String(codigo.insertId) };
  }

  it('deduplica y conserva estado, intentos y próxima ejecución tras reconectar', async () => {
    await conBaseMigrada(async (primera, segunda) => {
      const { uno, codigo } = await datos(primera);
      const migraciones = await primera.query('SELECT name FROM migrations ORDER BY id');
      expect(migraciones).toHaveLength(9);
      const id = (await primera.query(`INSERT INTO envios_correo
        (negocio_id, tipo, correo_destinatario, codigo_acceso_id, clave_dedupe, proximo_intento_en)
        VALUES (?, 'recuperacion', 'admin@example.test', ?, 'recuperacion:1', UTC_TIMESTAMP(6))`,
      [uno, codigo])).insertId;
      await expect(primera.query(`INSERT INTO envios_correo
        (negocio_id, tipo, correo_destinatario, codigo_acceso_id, clave_dedupe, proximo_intento_en)
        VALUES (?, 'recuperacion', 'admin@example.test', ?, 'recuperacion:1', UTC_TIMESTAMP(6))`,
      [uno, codigo])).rejects.toBeDefined();
      await primera.query(`UPDATE envios_correo SET estado = 'fallido', intentos = 2,
        ultimo_error = 'fallo controlado', proximo_intento_en = '2026-09-29 12:00:00.000000'
        WHERE id = ?`, [id]);
      await segunda.destroy();
      await segunda.initialize();
      const [fila] = await segunda.query(`SELECT estado, intentos, ultimo_error,
        proximo_intento_en FROM envios_correo WHERE id = ?`, [id]);
      expect(fila.estado).toBe('fallido');
      expect(fila.intentos).toBe(2);
      expect(fila.ultimo_error).toBe('fallo controlado');
      expect(fila.proximo_intento_en).toEqual(new Date('2026-09-29T12:00:00.000Z'));
      expect(await primera.runMigrations()).toEqual([]);
    });
  });

  it('rechaza referencias cruzadas, destinos incompatibles y arrendamientos incompletos', async () => {
    await conBaseMigrada(async (db) => {
      const { uno, dos, codigo } = await datos(db);
      const insertar = (negocioId: number, clave: string, extras = '') => db.query(`INSERT INTO envios_correo
        (negocio_id, tipo, correo_destinatario, codigo_acceso_id, clave_dedupe,
         proximo_intento_en${extras ? ', ' + extras : ''})
        VALUES (?, 'recuperacion', 'admin@example.test', ?, ?, UTC_TIMESTAMP(6)${extras ? ', ?' : ''})`,
      [negocioId, codigo, clave, ...(extras ? [-1] : [])]);
      await expect(insertar(dos, 'ajeno')).rejects.toBeDefined();
      await expect(insertar(uno, 'intentos-negativos', 'intentos')).rejects.toBeDefined();
      await expect(db.query(`INSERT INTO envios_correo
        (negocio_id, tipo, correo_destinatario, clave_dedupe, proximo_intento_en)
        VALUES (?, 'recuperacion', 'admin@example.test', 'sin-referencia', UTC_TIMESTAMP(6))`,
      [uno])).rejects.toBeDefined();
      await expect(db.query(`INSERT INTO envios_correo
        (negocio_id, tipo, correo_destinatario, codigo_acceso_id, clave_dedupe,
         estado, proximo_intento_en)
        VALUES (?, 'recuperacion', 'admin@example.test', ?, 'sin-lease',
          'tomado', UTC_TIMESTAMP(6))`, [uno, codigo])).rejects.toBeDefined();
      const columnas = await db.query(`SELECT COLUMN_NAME AS nombre FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'envios_correo'`);
      const nombres = columnas.map((fila: { nombre: string }) => fila.nombre);
      expect(nombres).not.toEqual(expect.arrayContaining(['cuerpo', 'texto', 'html', 'codigo']));
    });
  });

  it('vincula el aviso a una licencia propia y a su versión de vencimiento', async () => {
    await conBaseMigrada(async (db) => {
      const { uno, dos } = await datos(db);
      const licencia = await db.query('INSERT INTO licencias (negocio_id) VALUES (?)', [uno]);
      const aviso = (negocioId: number, version: number, clave: string) => db.query(`
        INSERT INTO envios_correo (negocio_id, tipo, correo_destinatario, licencia_id,
          version_vencimiento, clave_dedupe, proximo_intento_en)
        VALUES (?, 'aviso_vencimiento', 'admin@example.test', ?, ?, ?, UTC_TIMESTAMP(6))`,
      [negocioId, licencia.insertId, version, clave]);
      await expect(aviso(dos, 1, 'aviso-ajeno')).rejects.toBeDefined();
      await expect(aviso(uno, 0, 'aviso-sin-version')).rejects.toBeDefined();
      await aviso(uno, 1, 'aviso-propio');
      const [fila] = await db.query(`SELECT estado, intentos, version_vencimiento,
        arrendamiento_id, confirmado_en FROM envios_correo WHERE clave_dedupe = 'aviso-propio'`);
      expect(fila).toMatchObject({ estado: 'pendiente', intentos: 0, version_vencimiento: 1,
        arrendamiento_id: null, confirmado_en: null });
    });
  });
});
