import 'reflect-metadata';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import type { DataSourceOptions } from 'typeorm';
import { getDatabaseOptions } from './database.config';

export function crearDataSource(
  env: Record<string, string | undefined> = process.env,
): DataSource {
  const { autoLoadEntities: _autoLoadEntities, ...opciones } =
    getDatabaseOptions(env);

  return new DataSource({
    ...opciones,
    entities: [join(__dirname, '..', '**', '*.entity.{ts,js}')],
    migrations: [join(__dirname, '..', 'database', 'migrations', '*.{ts,js}')],
    synchronize: false,
    dropSchema: false,
    migrationsRun: false,
  } as DataSourceOptions);
}

// La CLI inicializa esta instancia únicamente al ejecutar un comando explícito.
export default crearDataSource();
