import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Configuración de migraciones y producción (T70)', () => {
  let crearDataSource: typeof import('./typeorm.datasource').crearDataSource;

  const produccion = {
    NODE_ENV: 'production',
    DB_HOST: 'localhost',
    DB_PORT: '3306',
    DB_USER: 'citas',
    DB_PASS: 'secreto',
    DB_NAME: 'citas',
  };

  const pruebas = {
    NODE_ENV: 'test',
    TEST_DB_HOST: 'localhost',
    TEST_DB_PORT: '3307',
    TEST_DB_USER: 'pruebas',
    TEST_DB_PASS: 'secreto-pruebas',
    TEST_DB_NAME: 'citas_test',
    TEST_DB_CONFIRMED: 'citas_test',
    DB_NAME: 'citas',
  };

  beforeAll(async () => {
    Object.assign(process.env, pruebas);
    ({ crearDataSource } = await import('./typeorm.datasource'));
  });

  it.each([
    ['producción', produccion, 'citas'],
    ['pruebas', pruebas, 'citas_test'],
  ])('crea una DataSource segura para %s', (_nombre, entorno, base) => {
    const dataSource = crearDataSource(entorno);

    expect(dataSource.isInitialized).toBe(false);
    expect(dataSource.options).toMatchObject({
      type: 'mariadb',
      database: base,
      synchronize: false,
      dropSchema: false,
      migrationsRun: false,
    });
    expect(dataSource.options.entities).toBeDefined();
    expect(dataSource.options.migrations).toBeDefined();
  });

  it('declara comandos para generar, ejecutar y revertir migraciones', () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'),
    ) as { scripts: Record<string, string> };

    expect(packageJson.scripts).toMatchObject({
      'migration:generate': expect.stringContaining('migration:generate'),
      'migration:run': expect.stringContaining('migration:run'),
      'migration:revert': expect.stringContaining('migration:revert'),
    });
    for (const comando of [
      packageJson.scripts['migration:generate'],
      packageJson.scripts['migration:run'],
      packageJson.scripts['migration:revert'],
    ]) {
      expect(comando).toContain('typeorm.datasource.ts');
    }
  });
});
