import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createConnection } from 'mysql2/promise';
import { conBaseMigrada } from './support/mariadb';

const IDENTIDAD = ['negocios', 'usuarios', 'altas_administrador', 'correos_acceso',
  'codigos_acceso', 'envios_correo'];
const CALENDARIO = ['sucursales', 'servicios', 'personal', 'personal_sucursales',
  'personal_servicios', 'horarios_personal', 'excepciones_horario',
  'franjas_excepcion_horario', 'bloqueos_horario'];

async function metadatos(conexion: { query: (sql: string, valores?: unknown[]) => Promise<unknown> },
  base: string, tablas: string[]) {
  const consultar = async (sql: string) => {
    const resultado = await conexion.query(sql, [base, ...tablas]) as unknown[];
    // mysql2 devuelve [filas, campos]; TypeORM devuelve directamente las filas.
    const filas = Array.isArray(resultado[0]) ? resultado[0] : resultado;
    return (filas as Record<string, unknown>[]).map((fila) => Object.fromEntries(
      Object.entries(fila).map(([clave, valor]) => [clave, valor === null ? null : String(valor)]),
    ));
  };
  const columnas = await consultar(`SELECT TABLE_NAME tabla, COLUMN_NAME columna,
    COLUMN_TYPE tipo, IS_NULLABLE anulable, COLUMN_DEFAULT defecto, EXTRA extra
    FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN (${tablas.map(() => '?')})
    ORDER BY TABLE_NAME, ORDINAL_POSITION`);
  const indices = await consultar(`SELECT TABLE_NAME tabla, INDEX_NAME indice,
    SEQ_IN_INDEX orden, COLUMN_NAME columna, NON_UNIQUE no_unico
    FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ?
      AND TABLE_NAME IN (${tablas.map(() => '?')})
    ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX`);
  const foraneas = await consultar(`SELECT k.TABLE_NAME tabla, k.CONSTRAINT_NAME nombre,
    k.COLUMN_NAME columna, k.REFERENCED_TABLE_NAME destino,
    k.REFERENCED_COLUMN_NAME destino_columna, r.UPDATE_RULE actualizar,
    r.DELETE_RULE eliminar
    FROM information_schema.KEY_COLUMN_USAGE k
    JOIN information_schema.REFERENTIAL_CONSTRAINTS r
      ON r.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME=k.CONSTRAINT_NAME
    WHERE k.TABLE_SCHEMA = ? AND k.TABLE_NAME IN (${tablas.map(() => '?')})
      AND k.REFERENCED_TABLE_NAME IS NOT NULL
    ORDER BY k.TABLE_NAME, k.CONSTRAINT_NAME, k.ORDINAL_POSITION`);
  const restricciones = await consultar(`SELECT tc.TABLE_NAME tabla, tc.CONSTRAINT_NAME nombre,
    cc.CHECK_CLAUSE clausula
    FROM information_schema.TABLE_CONSTRAINTS tc
    JOIN information_schema.CHECK_CONSTRAINTS cc
      ON cc.CONSTRAINT_SCHEMA=tc.CONSTRAINT_SCHEMA AND cc.CONSTRAINT_NAME=tc.CONSTRAINT_NAME
    WHERE tc.TABLE_SCHEMA = ? AND tc.TABLE_NAME IN (${tablas.map(() => '?')})
      AND tc.CONSTRAINT_TYPE = 'CHECK'
    ORDER BY tc.TABLE_NAME, tc.CONSTRAINT_NAME`);
  return { columnas, indices, foraneas, restricciones };
}

describe('M1-T124–T125 SQL de referencia frente a migraciones', () => {
  it.each([['identidad y mensajería', IDENTIDAD],
    ['catálogos y calendario', CALENDARIO]])('%s coincide en columnas, índices y pertenencia',
    async (_nombre, tablas) => {
      await conBaseMigrada(async (migrada) => {
        const base = `citas_esquema_${randomUUID().replaceAll('-', '')}`;
        if (!/^citas_esquema_[a-f0-9]{32}$/.test(base)) throw new Error('Base temporal inválida.');
        const conexion = await createConnection({ host: process.env.TEST_DB_HOST,
          port: Number(process.env.TEST_DB_PORT), user: process.env.TEST_DB_USER,
          password: process.env.TEST_DB_PASS, multipleStatements: true });
        try {
          // Solo se sustituye el nombre fijo del script en memoria; nunca se ejecuta sobre la base cotidiana.
          const script = readFileSync(join(process.cwd(), 'db', 'schema.sql'), 'utf8')
            .replaceAll('citas_saas_auth', base);
          await conexion.query(script);
          const esperados = await metadatos(migrada as never,
            String(migrada.options.database), tablas);
          const actuales = await metadatos(conexion as never, base, tablas);
          for (const categoria of ['columnas', 'indices', 'foraneas', 'restricciones'] as const) {
            expect(actuales[categoria]).toEqual(esperados[categoria]);
          }
        } finally {
          await conexion.query(`DROP DATABASE IF EXISTS \`${base}\``);
          await conexion.end();
        }
      });
    }, 60000);
});
