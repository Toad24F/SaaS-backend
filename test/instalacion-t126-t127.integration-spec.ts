import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createConnection } from 'mysql2/promise';
import { conBaseMigrada } from './support/mariadb';

describe('M1-T126–T127 instalación y SQL de licencias', () => {
  it('aplica una vez las migraciones y compara todas las tablas migradas con el SQL', async () => {
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
        // La instalación SQL autónoma debe incluir la relación nueva además de las históricas.
        expect(nombres).toContain('personal_servicios_sucursales');
        for (const tabla of nombres) {
          // La comparación incluye las fuentes nuevas sin omitir las tablas históricas.
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
        // Fase 3 compara también índices, CHECK y FKs, no solo tipos de columna.
        for (const tabla of ['configuracion_agenda', 'clientes', 'citas',
          'bloqueos_temporales']) {
          expect(nombres).toContain(tabla);
          const fechas = `SELECT COLUMN_NAME columna,
            DATETIME_PRECISION precisionTemporal FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND DATA_TYPE='datetime'
            ORDER BY ORDINAL_POSITION`;
          const [fechasMigracion] = await conexion.query(fechas, [migradaNombre, tabla]);
          const [fechasSql] = await conexion.query(fechas, [nombre, tabla]);
          expect(fechasSql).toEqual(fechasMigracion);
          for (const consulta of [
            `SELECT INDEX_NAME nombre, NON_UNIQUE noUnico, SEQ_IN_INDEX orden,
              COLUMN_NAME columna FROM information_schema.STATISTICS
              WHERE TABLE_SCHEMA=? AND TABLE_NAME=? ORDER BY INDEX_NAME, SEQ_IN_INDEX`,
            `SELECT CONSTRAINT_NAME nombre, CONSTRAINT_TYPE tipo
              FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=? AND TABLE_NAME=?
              ORDER BY CONSTRAINT_NAME`,
            `SELECT CONSTRAINT_NAME nombre, COLUMN_NAME columna,
              REFERENCED_TABLE_NAME tablaDestino, REFERENCED_COLUMN_NAME columnaDestino
              FROM information_schema.KEY_COLUMN_USAGE
              WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND REFERENCED_TABLE_NAME IS NOT NULL
              ORDER BY CONSTRAINT_NAME, ORDINAL_POSITION`,
            `SELECT c.CONSTRAINT_NAME nombre, c.CHECK_CLAUSE expresion
              FROM information_schema.TABLE_CONSTRAINTS t
              JOIN information_schema.CHECK_CONSTRAINTS c
                ON c.CONSTRAINT_SCHEMA=t.CONSTRAINT_SCHEMA
                AND c.CONSTRAINT_NAME=t.CONSTRAINT_NAME
              WHERE t.TABLE_SCHEMA=? AND t.TABLE_NAME=? AND t.CONSTRAINT_TYPE='CHECK'
              ORDER BY c.CONSTRAINT_NAME`,
            `SELECT CONSTRAINT_NAME nombre, UPDATE_RULE reglaUpdate, DELETE_RULE reglaDelete
              FROM information_schema.REFERENTIAL_CONSTRAINTS
              WHERE CONSTRAINT_SCHEMA=? AND TABLE_NAME=? ORDER BY CONSTRAINT_NAME`,
          ]) {
            const [migracion] = await conexion.query(consulta, [migradaNombre, tabla]);
            const [sql] = await conexion.query(consulta, [nombre, tabla]);
            expect(sql).toEqual(migracion);
          }
        }
        expect(migrada.options).toMatchObject({ synchronize: false, migrationsRun: false });
        const antes = await migrada.query('SELECT COUNT(*) total FROM migrations');
        expect(Number(antes[0].total)).toBe(23);
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
