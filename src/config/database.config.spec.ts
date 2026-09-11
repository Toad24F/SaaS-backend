import { getDatabaseOptions } from './database.config';

describe('Aislamiento de la base de pruebas (T04)', () => {
  const entorno = {
    NODE_ENV: 'test',
    TEST_DB_HOST: 'localhost',
    TEST_DB_PORT: '3306',
    TEST_DB_USER: 'pruebas',
    TEST_DB_PASS: 'solo-pruebas',
    TEST_DB_NAME: 'citas_test',
    TEST_DB_CONFIRMED: 'citas_test',
    DB_NAME: 'citas_cotidiana',
  };

  it('usa exclusivamente TEST_DB y desactiva cambios automáticos del esquema', () => {
    expect(getDatabaseOptions(entorno)).toMatchObject({
      type: 'mariadb', host: 'localhost', port: 3306,
      username: 'pruebas', database: 'citas_test',
      synchronize: false, dropSchema: false, migrationsRun: false,
    });
  });

  it('desactiva cambios automáticos del esquema en producción', () => {
    expect(getDatabaseOptions({
      NODE_ENV: 'production',
      DB_HOST: 'localhost',
      DB_PORT: '3306',
      DB_USER: 'citas',
      DB_PASS: 'secreto',
      DB_NAME: 'citas',
    })).toMatchObject({
      synchronize: false,
      dropSchema: false,
      migrationsRun: false,
    });
  });

  it.each(['TEST_DB_HOST', 'TEST_DB_PORT', 'TEST_DB_USER', 'TEST_DB_PASS',
    'TEST_DB_NAME', 'TEST_DB_CONFIRMED'])('rechaza la ausencia de %s', (clave) => {
    expect(() => getDatabaseOptions({ ...entorno, [clave]: undefined })).toThrow();
  });

  it('rechaza una confirmación que no corresponde a la base elegida', () => {
    expect(() => getDatabaseOptions({ ...entorno, TEST_DB_CONFIRMED: 'otra' })).toThrow();
  });

  it('rechaza el nombre de la base cotidiana', () => {
    expect(() => getDatabaseOptions({ ...entorno, DB_NAME: 'citas_test' })).toThrow();
  });

  it.each(['0', '65536', '3306x', '1.5'])('rechaza un puerto inválido: %s', (puerto) => {
    expect(() => getDatabaseOptions({ ...entorno, TEST_DB_PORT: puerto })).toThrow();
  });

  it('no incluye contraseñas en el error', () => {
    try {
      getDatabaseOptions({ ...entorno, TEST_DB_CONFIRMED: '' });
      throw new Error('Se esperaba rechazo');
    } catch (error) {
      expect(String(error)).not.toContain(entorno.TEST_DB_PASS);
    }
  });
});
