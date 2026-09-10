import { conDosConexiones } from './support/mariadb';

describe('Ejecutor MariaDB (T05; soporte RF-03, RF-11, RF-40)', () => {
  it('abre dos conexiones independientes y las cierra', async () => {
    let conexiones: Parameters<Parameters<typeof conDosConexiones>[0]> | undefined;
    await conDosConexiones(async (primera, segunda) => {
      conexiones = [primera, segunda];
      const [a, b] = await Promise.all([
        primera.query('SELECT CONNECTION_ID() AS id, DATABASE() AS nombre, VERSION() AS version'),
        segunda.query('SELECT CONNECTION_ID() AS id, DATABASE() AS nombre, VERSION() AS version'),
      ]);
      expect(a[0].id).not.toBe(b[0].id);
      expect(a[0].nombre).toBe(process.env.TEST_DB_NAME);
      expect(b[0].nombre).toBe(process.env.TEST_DB_NAME);
      expect(a[0].version).toMatch(/MariaDB/i);
    });
    expect(conexiones).toBeDefined();
    expect(conexiones!.every((conexion) => !conexion.isInitialized)).toBe(true);
  });

  it('cierra ambas conexiones aunque falle el caso de prueba', async () => {
    let conexiones: Parameters<Parameters<typeof conDosConexiones>[0]> | undefined;
    await expect(conDosConexiones(async (primera, segunda) => {
      conexiones = [primera, segunda];
      throw new Error('Fallo intencional');
    })).rejects.toThrow('Fallo intencional');
    expect(conexiones).toBeDefined();
    expect(conexiones!.every((conexion) => !conexion.isInitialized)).toBe(true);
  });
});
