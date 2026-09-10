import type { TypeOrmModuleOptions } from '@nestjs/typeorm';

export function getDatabaseOptions(
  env: Record<string, string | undefined> = process.env,
): TypeOrmModuleOptions {
  if (env.NODE_ENV !== 'test') {
    return {
      type: 'mariadb', host: env.DB_HOST, port: Number(env.DB_PORT),
      username: env.DB_USER, password: env.DB_PASS, database: env.DB_NAME,
      autoLoadEntities: true, synchronize: true,
    };
  }

  for (const clave of ['TEST_DB_HOST', 'TEST_DB_PORT', 'TEST_DB_USER',
    'TEST_DB_PASS', 'TEST_DB_NAME', 'TEST_DB_CONFIRMED']) {
    if (env[clave] === undefined || (clave !== 'TEST_DB_PASS' && !env[clave]?.trim())) {
      throw new Error(`Falta ${clave}: se exige una base exclusiva de pruebas.`);
    }
  }
  if (env.TEST_DB_CONFIRMED !== env.TEST_DB_NAME || env.TEST_DB_NAME === env.DB_NAME) {
    throw new Error('La base de pruebas debe estar confirmada y separada de DB_NAME.');
  }
  const puerto = Number(env.TEST_DB_PORT);
  if (!/^\d+$/.test(env.TEST_DB_PORT!) || !Number.isInteger(puerto) || puerto < 1 || puerto > 65535) {
    throw new Error('TEST_DB_PORT debe ser un puerto válido.');
  }
  return {
    type: 'mariadb', host: env.TEST_DB_HOST, port: puerto,
    username: env.TEST_DB_USER, password: env.TEST_DB_PASS, database: env.TEST_DB_NAME,
    autoLoadEntities: true, synchronize: false, dropSchema: false,
    migrationsRun: false, logging: false, timezone: 'Z',
    connectTimeout: 10000, retryAttempts: 0,
  };
}
