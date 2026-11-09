import { randomUUID } from 'node:crypto';
import { createConnection } from 'mysql2/promise';
import { DataSource } from 'typeorm';
import type { DataSourceOptions } from 'typeorm';
import { getDatabaseOptions } from '../../src/config/database.config';
import { crearDataSource } from '../../src/config/typeorm.datasource';

type OpcionesMariaDb = DataSourceOptions & {
  host?: string;
  port?: number;
  username?: string;
  password?: string;
};

// Ambos prefijos pertenecen al ejecutor; nunca se admite un nombre arbitrario.
const PATRON_BASE_TEMPORAL = /^citas_(?:persistencia|m4_test)_[a-f0-9]{32}$/;

function validarBaseTemporal(nombre: string): void {
  if (!PATRON_BASE_TEMPORAL.test(nombre)) {
    throw new Error('El nombre de la base temporal de persistencia no es seguro.');
  }
}

/** Reconstruye un límite histórico explícito en una base creada por el ejecutor. */
export async function retrocederHastaMigracion(db: DataSource, nombre: string): Promise<number> {
  if (process.env.NODE_ENV !== 'test') throw new Error('La reversión histórica requiere NODE_ENV=test.');
  validarBaseTemporal(String(db.options.database));
  const aplicadas: { name: string }[] = await db.query('SELECT name FROM migrations ORDER BY timestamp DESC');
  const cantidad = aplicadas.findIndex((fila) => fila.name === nombre);
  // Si el límite no existe, fallar antes de retirar cualquier migración.
  if (cantidad < 0) throw new Error(`No se encontró el límite histórico ${nombre}.`);
  for (let indice = 0; indice < cantidad; indice += 1) {
    await db.undoLastMigration({ transaction: 'each' });
  }
  return cantidad;
}

export async function conDosConexiones<T>(
  ejecutar: (primera: DataSource, segunda: DataSource) => Promise<T>,
): Promise<T> {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('El ejecutor MariaDB requiere NODE_ENV=test.');
  }
  const opciones = getDatabaseOptions();
  const primera = new DataSource({ ...opciones, entities: [], poolSize: 1 } as DataSourceOptions);
  const segunda = new DataSource({ ...opciones, entities: [], poolSize: 1 } as DataSourceOptions);
  let resultado: T | undefined;
  const errores: unknown[] = [];
  try {
    await primera.initialize();
    await segunda.initialize();
    resultado = await ejecutar(primera, segunda);
  } catch (error) {
    errores.push(error);
  }
  const cierres = await Promise.allSettled(
    [primera, segunda].filter((conexion) => conexion.isInitialized)
      .map((conexion) => conexion.destroy()),
  );
  for (const cierre of cierres) {
    if (cierre.status === 'rejected') errores.push(cierre.reason);
  }
  if (errores.length === 1) throw errores[0];
  if (errores.length > 1) throw new AggregateError(errores, 'Falló la operación o el cierre de conexiones de pruebas.');
  return resultado as T;
}

/**
 * Ejecuta un caso sobre una instalación nueva y desechable del modelo completo.
 * La validación estricta del nombre impide que la limpieza alcance TEST_DB_* u
 * otra base que no haya sido creada expresamente por esta invocación.
 */
export async function conBaseMigrada<T>(
  ejecutar: (primera: DataSource, segunda: DataSource) => Promise<T>,
  prefijo: 'citas_persistencia' | 'citas_m4_test' = 'citas_persistencia',
): Promise<T> {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('El ejecutor migrado requiere NODE_ENV=test.');
  }

  const nombre = `${prefijo}_${randomUUID().replaceAll('-', '')}`;
  validarBaseTemporal(nombre);
  const base = getDatabaseOptions() as OpcionesMariaDb;
  const administracion = await createConnection({
    host: base.host,
    port: base.port,
    user: base.username,
    password: base.password,
  });
  let primera: DataSource | undefined;
  let segunda: DataSource | undefined;
  let creada = false;
  let resultado: T | undefined;
  const errores: unknown[] = [];

  try {
    await administracion.query(
      `CREATE DATABASE \`${nombre}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
    creada = true;
    const entorno = {
      ...process.env,
      TEST_DB_NAME: nombre,
      TEST_DB_CONFIRMED: nombre,
    };
    primera = crearDataSource(entorno);
    segunda = crearDataSource(entorno);
    await primera.initialize();
    await primera.runMigrations({ transaction: 'each' });
    await segunda.initialize();
    resultado = await ejecutar(primera, segunda);
  } catch (error) {
    errores.push(error);
  } finally {
    // Primero se liberan pools; solo después se elimina la base temporal validada.
    const cierres = await Promise.allSettled(
      [primera, segunda]
        .filter((conexion): conexion is DataSource => Boolean(conexion?.isInitialized))
        .map((conexion) => conexion.destroy()),
    );
    for (const cierre of cierres) {
      if (cierre.status === 'rejected') errores.push(cierre.reason);
    }
    if (creada) {
      try {
        validarBaseTemporal(nombre);
        await administracion.query(`DROP DATABASE \`${nombre}\``);
      } catch (error) {
        errores.push(error);
      }
    }
    try {
      await administracion.end();
    } catch (error) {
      errores.push(error);
    }
  }

  if (errores.length === 1) throw errores[0];
  if (errores.length > 1) {
    throw new AggregateError(
      errores,
      'Falló el caso o la limpieza de la base migrada de pruebas.',
    );
  }
  return resultado as T;
}
