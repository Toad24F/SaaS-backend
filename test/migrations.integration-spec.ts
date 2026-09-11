import { randomUUID } from 'node:crypto';
import { createConnection } from 'mysql2/promise';
import type { Connection } from 'mysql2/promise';
import { DataSource } from 'typeorm';
import type { DataSourceOptions } from 'typeorm';
import { getDatabaseOptions } from '../src/config/database.config';
import { CrearNegociosUsuarios1760000000000 } from '../src/database/migrations/1760000000000-CrearNegociosUsuarios';
import { CrearLicencias1760000001000 } from '../src/database/migrations/1760000001000-CrearLicencias';
import { CrearCodigosSesiones1760000002000 } from '../src/database/migrations/1760000002000-CrearCodigosSesiones';
import { CrearAuditoriaLimites1760000003000 } from '../src/database/migrations/1760000003000-CrearAuditoriaLimites';

describe('Migraciones T15–T18 en MariaDB', () => {
  const baseTemporal = `citas_migraciones_${randomUUID().replaceAll('-', '')}`;
  let administracion: Connection;
  let primera: DataSource;
  let segunda: DataSource;

  const opciones = (): DataSourceOptions => {
    const base = getDatabaseOptions();
    return {
      ...base,
      database: baseTemporal,
      entities: [],
      migrations: [
        CrearNegociosUsuarios1760000000000,
        CrearLicencias1760000001000,
        CrearCodigosSesiones1760000002000,
        CrearAuditoriaLimites1760000003000,
      ],
      migrationsRun: false,
    } as DataSourceOptions;
  };

  beforeAll(async () => {
    expect(baseTemporal).toMatch(/^citas_migraciones_[a-f0-9]{32}$/);
    const base = getDatabaseOptions();
    administracion = await createConnection({
      host: base.host,
      port: base.port,
      user: base.username,
      password: base.password,
    });
    await administracion.query(
      `CREATE DATABASE \`${baseTemporal}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
    primera = await new DataSource(opciones()).initialize();
    await primera.runMigrations({ transaction: 'each' });
    segunda = await new DataSource(opciones()).initialize();
  });

  afterAll(async () => {
    await Promise.allSettled([
      primera?.isInitialized ? primera.destroy() : Promise.resolve(),
      segunda?.isInitialized ? segunda.destroy() : Promise.resolve(),
    ]);
    if (administracion) {
      expect(baseTemporal).toMatch(/^citas_migraciones_[a-f0-9]{32}$/);
      await administracion.query(`DROP DATABASE IF EXISTS \`${baseTemporal}\``);
      await administracion.end();
    }
  });

  async function insertarNegocio(sufijo = randomUUID()) {
    const resultado = await primera.query(
      'INSERT INTO negocios (nombre, slug, email_contacto) VALUES (?, ?, ?)',
      [`Negocio ${sufijo}`, `negocio-${sufijo}`, `${sufijo}@example.test`],
    );
    return Number(resultado.insertId);
  }

  async function insertarUsuario(
    negocioId: number | null,
    rol: string,
    sufijo = randomUUID(),
  ) {
    const resultado = await primera.query(
      `INSERT INTO usuarios
       (negocio_id, nombre, email, password_hash, rol, activado_en)
       VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP(6))`,
      [negocioId, `Usuario ${sufijo}`, `${sufijo}@example.test`, 'hash', rol],
    );
    return Number(resultado.insertId);
  }

  it('T15 crea negocios/usuarios y reserva correos y administrador únicos', async () => {
    const negocioId = await insertarNegocio();
    await primera.query(
      `INSERT INTO usuarios (negocio_id, email, rol)
       VALUES (?, 'admin@example.test', 'admin_negocio')`,
      [negocioId],
    );

    await expect(primera.query(
      `INSERT INTO usuarios (negocio_id, email, rol)
       VALUES (?, 'otro-admin@example.test', 'admin_negocio')`,
      [negocioId],
    )).rejects.toBeDefined();
    await expect(primera.query(
      `INSERT INTO usuarios (negocio_id, email, rol)
       VALUES (?, 'admin@example.test', 'recepcionista')`,
      [negocioId],
    )).rejects.toBeDefined();
    await expect(primera.query(
      `INSERT INTO usuarios (negocio_id, email, rol)
       VALUES (?, ' ADMIN@example.test ', 'recepcionista')`,
      [negocioId],
    )).rejects.toBeDefined();
    await expect(primera.query(
      `INSERT INTO usuarios (negocio_id, email, rol)
       VALUES (?, 'global@example.test', 'superadmin')`,
      [negocioId],
    )).rejects.toBeDefined();
    await expect(primera.query(
      `INSERT INTO usuarios (negocio_id, email, rol)
       VALUES (NULL, 'sin-negocio@example.test', 'recepcionista')`,
    )).rejects.toBeDefined();
  });

  it('T16 admite una licencia anual coherente por negocio', async () => {
    const negocioId = await insertarNegocio();
    await primera.query('INSERT INTO licencias (negocio_id) VALUES (?)', [negocioId]);
    await expect(
      primera.query('INSERT INTO licencias (negocio_id) VALUES (?)', [negocioId]),
    ).rejects.toBeDefined();

    const negocioHabilitado = await insertarNegocio();
    await expect(primera.query(
      `INSERT INTO licencias (negocio_id, habilitada_en, vence_en)
       VALUES (?, UTC_TIMESTAMP(6), DATE_ADD(UTC_TIMESTAMP(6), INTERVAL 1 YEAR))`,
      [negocioHabilitado],
    )).resolves.toBeDefined();

    for (const valores of [
      ['2026-01-01 00:00:00', null, null],
      [null, '2027-01-01 00:00:00', null],
      ['2026-01-01 00:00:00', '2027-01-01 00:00:00', '2028-01-01 00:00:00'],
    ]) {
      const otroNegocio = await insertarNegocio();
      await expect(primera.query(
        `INSERT INTO licencias
         (negocio_id, habilitada_en, vence_en, suspendida_en)
         VALUES (?, ?, ?, ?)`,
        [otroNegocio, ...valores],
      )).rejects.toBeDefined();
    }

    const columnas = await primera.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = 'licencias'`,
    );
    expect((columnas as Array<{ column_name: string }>).map((fila) => fila.column_name))
      .not.toEqual(expect.arrayContaining(['modalidad', 'plan']));
  });

  it('T17 conserva historial/hash único y rechaza relaciones inexistentes', async () => {
    const negocioId = await insertarNegocio();
    const usuarioId = await insertarUsuario(negocioId, 'recepcionista');
    const emisorId = await insertarUsuario(null, 'superadmin');
    const hash = 'a'.repeat(64);

    await primera.query(
      `INSERT INTO codigos_acceso
       (negocio_id, usuario_id, emisor_usuario_id, proposito, codigo_hash,
        expira_en, consumido_en)
       VALUES (?, ?, ?, 'recuperacion', ?,
        DATE_ADD(UTC_TIMESTAMP(6), INTERVAL 30 MINUTE), UTC_TIMESTAMP(6))`,
      [negocioId, usuarioId, emisorId, hash],
    );
    await primera.query(
      `INSERT INTO codigos_acceso
       (negocio_id, usuario_id, emisor_usuario_id, proposito, codigo_hash, expira_en)
       VALUES (?, ?, ?, 'recuperacion', ?, DATE_ADD(UTC_TIMESTAMP(6), INTERVAL 30 MINUTE))`,
      [negocioId, usuarioId, emisorId, 'b'.repeat(64)],
    );
    await expect(primera.query(
      `INSERT INTO codigos_acceso
       (negocio_id, usuario_id, emisor_usuario_id, proposito, codigo_hash, expira_en)
       VALUES (?, ?, ?, 'activacion_recepcionista', ?, DATE_ADD(UTC_TIMESTAMP(6), INTERVAL 48 HOUR))`,
      [negocioId, usuarioId, emisorId, hash],
    )).rejects.toBeDefined();
    await expect(primera.query(
      `INSERT INTO codigos_acceso
       (negocio_id, usuario_id, emisor_usuario_id, proposito, codigo_hash, expira_en)
       VALUES (?, ?, ?, 'activacion_recepcionista', ?, DATE_ADD(UTC_TIMESTAMP(6), INTERVAL 48 HOUR))`,
      [negocioId, 2147483647, emisorId, 'c'.repeat(64)],
    )).rejects.toBeDefined();
    await expect(primera.query(
      `INSERT INTO sesiones (id, usuario_id, expira_en)
       VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(6), INTERVAL 1 HOUR))`,
      [randomUUID(), 2147483647],
    )).rejects.toBeDefined();
    await expect(primera.query(
      `INSERT INTO sesiones (id, usuario_id, creada_en, expira_en)
       VALUES (?, ?, @sesion_ahora := UTC_TIMESTAMP(6),
        DATE_ADD(@sesion_ahora, INTERVAL 1 HOUR))`,
      [randomUUID(), usuarioId],
    )).resolves.toBeDefined();
  });

  it('T18 rechaza destinos cruzados y coordina una sola fila por IP', async () => {
    const negocioA = await insertarNegocio();
    const negocioB = await insertarNegocio();
    const usuarioB = await insertarUsuario(negocioB, 'recepcionista');
    const actorId = await insertarUsuario(null, 'superadmin');
    const licenciaB = await primera.query(
      'INSERT INTO licencias (negocio_id) VALUES (?)',
      [negocioB],
    );

    await expect(primera.query(
      `INSERT INTO eventos_auditoria
       (operacion_id, actor_usuario_id, negocio_id, usuario_id, accion)
       VALUES (?, ?, ?, ?, 'prueba')`,
      [randomUUID(), actorId, negocioA, usuarioB],
    )).rejects.toBeDefined();
    await expect(primera.query(
      `INSERT INTO eventos_auditoria
       (operacion_id, actor_usuario_id, negocio_id, licencia_id, accion)
       VALUES (?, ?, ?, ?, 'prueba')`,
      [randomUUID(), actorId, negocioA, Number(licenciaB.insertId)],
    )).rejects.toBeDefined();

    const resultados = await Promise.allSettled([
      primera.query(
        `INSERT INTO limites_intentos (origen, ventana_inicio, intentos)
         VALUES ('2001:db8::1', UTC_TIMESTAMP(6), 1)`,
      ),
      segunda.query(
        `INSERT INTO limites_intentos (origen, ventana_inicio, intentos)
         VALUES ('2001:db8::1', UTC_TIMESTAMP(6), 1)`,
      ),
    ]);
    expect(resultados.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(resultados.filter(({ status }) => status === 'rejected')).toHaveLength(1);
  });

  it('revierte las cuatro migraciones sin dejar tablas del modelo', async () => {
    for (let indice = 0; indice < 4; indice += 1) {
      await primera.undoLastMigration({ transaction: 'each' });
    }
    const tablas = await primera.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_name <> 'migrations'`,
    );
    expect(tablas).toHaveLength(0);
  });
});
