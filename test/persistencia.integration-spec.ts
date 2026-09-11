import { createConnection } from 'mysql2/promise';
import type { DataSource } from 'typeorm';
import { Licencia } from '../src/licencias/entities/licencia.entity';
import { Negocio } from '../src/negocios/entities/negocio.entity';
import { Usuario } from '../src/usuarios/entities/usuario.entity';
import { Rol } from '../src/auth/enums/rol.enum';
import { getDatabaseOptions } from '../src/config/database.config';
import { conBaseMigrada } from './support/mariadb';

async function existeBase(nombre: string): Promise<boolean> {
  const opciones = getDatabaseOptions();
  const conexion = await createConnection({
    host: opciones.host,
    port: opciones.port,
    user: opciones.username,
    password: opciones.password,
  });
  try {
    const [filas] = await conexion.query(
      'SELECT SCHEMA_NAME FROM information_schema.schemata WHERE SCHEMA_NAME = ?',
      [nombre],
    );
    return (filas as unknown[]).length === 1;
  } finally {
    await conexion.end();
  }
}

describe('Ejecutor de persistencia aislada (T71)', () => {
  it('usa migraciones, entidades, IDs de MariaDB y dos conexiones', async () => {
    let baseTemporal = '';

    await conBaseMigrada(async (primera, segunda) => {
      baseTemporal = String(primera.options.database);
      expect(primera).not.toBe(segunda);
      expect(primera.isInitialized).toBe(true);
      expect(segunda.isInitialized).toBe(true);
      expect(segunda.options.database).toBe(baseTemporal);
      expect(primera.entityMetadatas.map(({ target }) => target)).toEqual(
        expect.arrayContaining([Negocio, Usuario, Licencia]),
      );

      const negocio = await primera.getRepository(Negocio).save(
        Object.assign(new Negocio(), {
          nombre: 'Negocio persistido',
          slug: 'negocio-persistido',
          emailContacto: 'contacto@example.test',
          telefonoContacto: null,
          activadoEn: null,
        }),
      );
      expect(negocio.id).toEqual(expect.any(Number));
      expect(negocio.id).toBeGreaterThan(0);

      const usuario = await primera.getRepository(Usuario).save(
        Object.assign(new Usuario(), {
          negocioId: negocio.id,
          negocio,
          nombre: null,
          email: '  Pendiente@Example.TEST ',
          passwordHash: null,
          rol: Rol.ADMIN_NEGOCIO,
          activo: true,
          activadoEn: null,
        }),
      );
      expect(usuario.id).toEqual(expect.any(Number));

      const licencia = await segunda.getRepository(Licencia).save(
        Object.assign(new Licencia(), {
          negocioId: negocio.id,
          negocio,
          habilitadaEn: null,
          venceEn: null,
          suspendidaEn: null,
        }),
      );
      expect(licencia.id).toEqual(expect.any(Number));

      await expect(
        segunda.getRepository(Usuario).findOneByOrFail({ id: usuario.id }),
      ).resolves.toMatchObject({
        id: usuario.id,
        negocioId: negocio.id,
        email: 'pendiente@example.test',
      });
    });

    expect(baseTemporal).toMatch(/^citas_persistencia_[a-f0-9]{32}$/);
    await expect(existeBase(baseTemporal)).resolves.toBe(false);
  });

  it('cierra ambas conexiones y elimina la base aunque falle el caso', async () => {
    let primeraCapturada: DataSource | undefined;
    let segundaCapturada: DataSource | undefined;
    let baseTemporal = '';

    await expect(conBaseMigrada(async (primera, segunda) => {
      primeraCapturada = primera;
      segundaCapturada = segunda;
      baseTemporal = String(primera.options.database);
      throw new Error('fallo controlado del caso');
    })).rejects.toThrow('fallo controlado del caso');

    expect(primeraCapturada?.isInitialized).toBe(false);
    expect(segundaCapturada?.isInitialized).toBe(false);
    await expect(existeBase(baseTemporal)).resolves.toBe(false);
  });
});
