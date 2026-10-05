import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createConnection } from 'mysql2/promise';
import { conBaseMigrada } from './support/mariadb';

describe('M1-T126–T127 instalación y SQL de licencias', () => {
  it('aplica una vez las migraciones y compara todo el esquema migrado con el SQL', async () => {
    await conBaseMigrada(async (migrada, segunda) => {
      const nombre = `citas_esquema_${randomUUID().replaceAll('-', '')}`;
      if (!/^citas_esquema_[a-f0-9]{32}$/.test(nombre)) throw new Error('Base temporal inválida.');
      const conexion = await createConnection({ host: process.env.TEST_DB_HOST,
        port: Number(process.env.TEST_DB_PORT), user: process.env.TEST_DB_USER,
        password: process.env.TEST_DB_PASS, multipleStatements: true });
      try {
        // El SQL se reescribe solo en memoria hacia una base nueva; la cotidiana queda intacta.
        const script = readFileSync(join(process.cwd(), 'db', 'schema.sql'), 'utf8')
          .replaceAll('citas_saas_auth', nombre);
        await conexion.query(script);
        const migradaNombre = String(migrada.options.database);
        const [tablas] = await conexion.query(`SELECT TABLE_NAME nombre FROM information_schema.TABLES
          WHERE TABLE_SCHEMA=? AND TABLE_TYPE='BASE TABLE'`, [migradaNombre]);
        const nombres = (tablas as { nombre: string }[]).map((fila) => fila.nombre)
          .filter((tabla) => !['migrations', 'typeorm_metadata'].includes(tabla)).sort();
        expect(nombres).toContain('licencias');
        for (const tabla of nombres) {
          // Compara definición efectiva, incluyendo restricciones y reglas de pertenencia.
          const [columnas] = await conexion.query(`SELECT COLUMN_NAME nombre, COLUMN_TYPE tipo,
            IS_NULLABLE anulable, COLUMN_DEFAULT defecto, EXTRA extra
            FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=?
            ORDER BY ORDINAL_POSITION`, [migradaNombre, tabla]);
          const [referencia] = await conexion.query(`SELECT COLUMN_NAME nombre, COLUMN_TYPE tipo,
            IS_NULLABLE anulable, COLUMN_DEFAULT defecto, EXTRA extra
            FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=?
            ORDER BY ORDINAL_POSITION`, [nombre, tabla]);
          expect(referencia).toEqual(columnas);
        }
        const antes = await migrada.query('SELECT COUNT(*) total FROM migrations');
        expect(Number(antes[0].total)).toBe(17);
        await expect(segunda.runMigrations({ transaction: 'each' })).resolves.toEqual([]);
        const despues = await migrada.query('SELECT COUNT(*) total FROM migrations');
        expect(despues).toEqual(antes);
      } finally {
        await conexion.query(`DROP DATABASE IF EXISTS \`${nombre}\``);
        await conexion.end();
      }
    });
  }, 60000);

  it('admite suspensión efectiva con remanente cero y conserva versión', async () => {
    await conBaseMigrada(async (db) => {
      const negocio = await db.query(`INSERT INTO negocios
        (nombre, slug, email_contacto) VALUES ('Cero', ?, 'cero@example.test')`,
        [`cero-${randomUUID()}`]);
      const id = Number(negocio.insertId);
      // creado_en antecede a la habilitación; el bloqueo llega después del vencimiento.
      await db.query(`INSERT INTO licencias (negocio_id, creado_en, habilitada_en,
        vence_en, suspension_solicitada_en, bloqueo_programado_en, suspendida_en,
        congelada_en, remanente_ms, version_vencimiento)
        VALUES (?, '2024-01-01 00:00:00', '2024-01-02 00:00:00',
          '2025-01-02 00:00:00', '2025-01-01 00:00:00', '2025-01-03 00:00:00',
          '2025-01-03 00:00:00', '2025-01-03 00:00:00', 0, 2)`, [id]);
      const filas = await db.query(`SELECT remanente_ms remanente, version_vencimiento version
        FROM licencias WHERE negocio_id=?`, [id]);
      expect(filas[0]).toMatchObject({ remanente: '0', version: 2 });
    });
  });
});
