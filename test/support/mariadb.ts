import { DataSource } from 'typeorm';
import type { DataSourceOptions } from 'typeorm';
import { getDatabaseOptions } from '../../src/config/database.config';

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
