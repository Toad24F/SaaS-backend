import { randomUUID } from 'node:crypto';
import { createConnection, type Connection } from 'mysql2/promise';
import { DataSource } from 'typeorm';
import { getDatabaseOptions } from '../src/config/database.config';
import { TelefonosInternacionales1760000069000 } from '../src/database/migrations/1760000069000-TelefonosInternacionales';

describe('migración de teléfonos internacionales', () => {
  const nombre = `citas_test_telefonos_${randomUUID().replaceAll('-', '')}`;
  let admin: Connection;
  let db: DataSource;

  beforeAll(async () => {
    const opciones = getDatabaseOptions();
    admin = await createConnection({ host: opciones.host, port: opciones.port,
      user: opciones.username, password: opciones.password });
    expect(nombre).toMatch(/^citas_test_telefonos_[a-f0-9]{32}$/);
    await admin.query(`CREATE DATABASE \`${nombre}\` CHARACTER SET utf8mb4`);
    db = await new DataSource({ ...opciones, database: nombre, entities: [], migrations: [],
      synchronize: false, migrationsRun: false }).initialize();
    await db.query(`CREATE TABLE clientes (id INT PRIMARY KEY, telefono VARCHAR(10) NOT NULL,
      CONSTRAINT chk_clientes_telefono CHECK (CHAR_LENGTH(telefono) = 10))`);
    await db.query('CREATE TABLE citas (id INT PRIMARY KEY, telefono_contacto VARCHAR(10) NULL)');
  });

  afterAll(async () => {
    if (db?.isInitialized) await db.destroy();
    if (admin) await admin.query(`DROP DATABASE IF EXISTS \`${nombre}\``);
    await admin?.end();
  });

  it('conserva contactos previos y admite E.164 sin truncar', async () => {
    await db.query("INSERT INTO clientes VALUES (1,'6141234567')");
    await db.query("INSERT INTO citas VALUES (1,'6141234567')");
    const corredor = db.createQueryRunner();
    try {
      const migracion = new TelefonosInternacionales1760000069000();
      await migracion.up(corredor);
      await db.query("INSERT INTO clientes VALUES (2,'+14165550123')");
      await db.query("INSERT INTO citas VALUES (2,'+5511987654321')");
      expect(await db.query('SELECT telefono FROM clientes ORDER BY id'))
        .toEqual([{ telefono: '6141234567' }, { telefono: '+14165550123' }]);
      expect(await db.query('SELECT telefono_contacto FROM citas ORDER BY id'))
        .toEqual([{ telefono_contacto: '6141234567' }, { telefono_contacto: '+5511987654321' }]);
      await expect(migracion.down(corredor)).rejects.toThrow(/internacionales/i);
    } finally { await corredor.release(); }
  });
});
