import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { conBaseMigrada } from './support/mariadb';

describe('T61 — instalación desde cero', () => {
  it('inicia la aplicación sobre migraciones nuevas y no las reaplica', async () => {
    await conBaseMigrada(async (primera, segunda) => {
      const nombreTemporal = String(primera.options.database);
      const entornoAnterior = {
        TEST_DB_NAME: process.env.TEST_DB_NAME,
        TEST_DB_CONFIRMED: process.env.TEST_DB_CONFIRMED,
      };
      let app: INestApplication | undefined;

      try {
        // El módulo real arranca contra la base temporal ya migrada. Las banderas
        // prueban que el inicio nunca sincroniza ni altera el esquema por sí solo.
        process.env.TEST_DB_NAME = nombreTemporal;
        process.env.TEST_DB_CONFIRMED = nombreTemporal;
        const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
        app = modulo.createNestApplication();
        await app.init();

        const conexionAplicacion = app.get(DataSource);
        expect(conexionAplicacion.options).toMatchObject({
          database: nombreTemporal,
          synchronize: false,
          dropSchema: false,
          migrationsRun: false,
        });

        // Una segunda ejecución debe consultar el historial y devolver cero
        // migraciones pendientes, sin recrear tablas ni modificar datos.
        await expect(segunda.runMigrations({ transaction: 'each' })).resolves.toEqual([]);
        const historial = await segunda.query('SELECT COUNT(*) AS total FROM migrations');
        expect(Number(historial[0].total)).toBe(4);
      } finally {
        await app?.close();
        process.env.TEST_DB_NAME = entornoAnterior.TEST_DB_NAME;
        process.env.TEST_DB_CONFIRMED = entornoAnterior.TEST_DB_CONFIRMED;
      }
    });
  });

  it('instala la restricción de sesiones con duración exacta de 12 horas', async () => {
    await conBaseMigrada(async (primera) => {
      const negocio = await primera.query(
        "INSERT INTO negocios (nombre, slug, email_contacto) VALUES ('T61', 't61', 't61@example.test')",
      );
      const usuario = await primera.query(
        `INSERT INTO usuarios
         (negocio_id, nombre, email, password_hash, rol, activado_en)
         VALUES (?, 'Recepción T61', 'recepcion-t61@example.test', 'hash',
          'recepcionista', UTC_TIMESTAMP(6))`,
        [Number(negocio.insertId)],
      );

      // La inserción válida acredita que la migración nueva coincide con la
      // duración que usa el servicio; una hora debe quedar rechazada.
      await expect(primera.query(
        `INSERT INTO sesiones (id, usuario_id, creada_en, expira_en)
         VALUES (UUID(), ?, @inicio := UTC_TIMESTAMP(6),
          DATE_ADD(@inicio, INTERVAL 12 HOUR))`,
        [Number(usuario.insertId)],
      )).resolves.toBeDefined();
      await expect(primera.query(
        `INSERT INTO sesiones (id, usuario_id, creada_en, expira_en)
         VALUES (UUID(), ?, @inicio := UTC_TIMESTAMP(6),
          DATE_ADD(@inicio, INTERVAL 1 HOUR))`,
        [Number(usuario.insertId)],
      )).rejects.toBeDefined();
    });
  });
});
