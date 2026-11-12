import { conBaseMigrada } from './support/mariadb';
import { crearEscenarioPortal } from './support/escenario-portal';
import { RelojPrueba } from './support/reloj';
import { BarreraPrueba, ejecutarConFalloAntesDeCommit } from './support/concurrencia-portal';
import { createConnection } from 'mysql2/promise';
import { getDatabaseOptions } from '../src/config/database.config';

describe('M3-T003–T006: preparación de integración pública', () => {
  it('crea una base distinta de la cotidiana y la elimina al cerrar', async () => {
    expect(() => getDatabaseOptions({ ...process.env,
      DB_NAME: 'base_cotidiana_simulada', TEST_DB_NAME: 'base_cotidiana_simulada',
      TEST_DB_CONFIRMED: 'base_cotidiana_simulada',
    })).toThrow('separada de DB_NAME');
    let nombre = '';
    await conBaseMigrada(async (db) => {
      nombre = String(db.options.database);
      expect(nombre).toMatch(/^citas_persistencia_[a-f0-9]{32}$/);
      expect(nombre).not.toBe(process.env.DB_NAME);
    });
    // Comprueba en el servidor que el esquema temporal ya no existe.
    const opciones = getDatabaseOptions() as { host: string; port: number;
      username: string; password: string };
    const admin = await createConnection({ host: opciones.host, port: opciones.port,
      user: opciones.username, password: opciones.password });
    try {
      const [filas] = await admin.query('SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?', [nombre]);
      expect(filas).toEqual([]);
    } finally { await admin.end(); }
  });

  it('siembra dos negocios aislados y limpia sus datos al destruir la base', async () => {
    await conBaseMigrada(async (db) => {
      const datos = await crearEscenarioPortal(db, new RelojPrueba(new Date('2026-10-20T12:00:00Z')));
      expect(datos.negocios).toHaveLength(2);
      expect(datos.negocios[0].profesionales).toHaveLength(2);
      expect(datos.negocios[0].sucursales.map((s) => s.zona)).toEqual([
        'America/Chihuahua', 'America/Mexico_City',
      ]);
      expect(datos.negocios[0].telefonoCliente).toBe(datos.negocios[1].telefonoCliente);
      expect(datos.negocios[0].servicioInactivoId).toBeGreaterThan(0);
      expect(datos.negocios[0].ocupaciones).toHaveLength(2);
      const filas = await db.query('SELECT COUNT(*) total FROM citas');
      expect(Number(filas[0].total)).toBe(2);
      const ajena = await db.query('SELECT COUNT(*) total FROM citas WHERE negocio_id = ? AND personal_id = ?',
        [datos.negocios[0].id, datos.negocios[1].profesionales[0]]);
      expect(Number(ajena[0].total)).toBe(0);
    });
  });

  it('rechaza una fixture dirigida a una base que el ejecutor no creó', async () => {
    // La comprobación ocurre antes de cualquier INSERT; un nombre test cotidiano tampoco autoriza limpieza.
    const destinoNoAutorizado = { options: { database: 'citas_desarrollo' } };
    await expect(crearEscenarioPortal(destinoNoAutorizado as never,
      new RelojPrueba(new Date('2026-10-20T12:00:00Z'))))
      .rejects.toThrow('base desechable migrada');
  });

  it('controla el milisegundo anterior, exacto y posterior y revierte un fallo', async () => {
    await conBaseMigrada(async (db) => {
      const reloj = new RelojPrueba(new Date('2026-10-20T12:00:00Z'));
      const expira = reloj.ahora().getTime() + 300_000;
      reloj.avanzar(299_999);
      expect(reloj.ahora().getTime()).toBe(expira - 1);
      reloj.avanzar(1);
      expect(reloj.ahora().getTime()).toBe(expira);
      reloj.avanzar(1);
      expect(reloj.ahora().getTime()).toBe(expira + 1);
      await expect(ejecutarConFalloAntesDeCommit(db, async (manager) => {
        await manager.query("INSERT INTO negocios (nombre,slug,email_contacto) VALUES ('Fallo','fallo-portal','f@example.test')");
      })).rejects.toThrow('Fallo de prueba antes del commit');
      expect(Number((await db.query("SELECT COUNT(*) total FROM negocios WHERE slug='fallo-portal'"))[0].total)).toBe(0);
    });
  });

  it('demuestra espera y continuación con dos conexiones y barreras explícitas', async () => {
    await conBaseMigrada(async (primera, segunda) => {
      const alta = await primera.query("INSERT INTO negocios (nombre,slug,email_contacto) VALUES ('Bloqueo','bloqueo-portal','b@example.test')");
      const id = Number(alta.insertId);
      const barrera = new BarreraPrueba();
      const uno = primera.createQueryRunner();
      const dos = segunda.createQueryRunner();
      await uno.connect();
      await dos.connect();
      try {
        await uno.startTransaction();
        await uno.query('SELECT id FROM negocios WHERE id = ? FOR UPDATE', [id]);
        const espera = (async () => {
          await dos.startTransaction();
          barrera.abrir();
          await dos.query('SELECT id FROM negocios WHERE id = ? FOR UPDATE', [id]);
          await dos.query("UPDATE negocios SET nombre='Continuó' WHERE id = ?", [id]);
          await dos.commitTransaction();
        })();
        await barrera.esperar();
        // La segunda conexión ya intentó avanzar, pero la primera conserva la fila.
        let termino = false;
        void espera.then(() => { termino = true; });
        await new Promise<void>((resolver) => setImmediate(resolver));
        expect(termino).toBe(false);
        const estado = await uno.query('SELECT nombre FROM negocios WHERE id = ?', [id]);
        expect(estado[0].nombre).toBe('Bloqueo');
        await uno.commitTransaction();
        await espera;
        expect((await primera.query('SELECT nombre FROM negocios WHERE id = ?', [id]))[0].nombre).toBe('Continuó');
      } finally {
        if (uno.isTransactionActive) await uno.rollbackTransaction();
        if (dos.isTransactionActive) await dos.rollbackTransaction();
        await uno.release();
        await dos.release();
      }
    });
  });

  it('revierte ambas transacciones y libera conexiones si el caso falla', async () => {
    let conexiones: { isInitialized: boolean }[] = [];
    await expect(conBaseMigrada(async (primera, segunda) => {
      conexiones = [primera, segunda];
      const uno = primera.createQueryRunner();
      const dos = segunda.createQueryRunner();
      await uno.connect();
      await dos.connect();
      try {
        await uno.startTransaction();
        await dos.startTransaction();
        await uno.query("INSERT INTO negocios (nombre,slug,email_contacto) VALUES ('Temporal','rollback-portal','r@example.test')");
        throw new Error('Fallo controlado de carrera');
      } finally {
        if (uno.isTransactionActive) await uno.rollbackTransaction();
        if (dos.isTransactionActive) await dos.rollbackTransaction();
        await uno.release();
        await dos.release();
      }
    })).rejects.toThrow('Fallo controlado de carrera');
    expect(conexiones.every((conexion) => !conexion.isInitialized)).toBe(true);
  });
});
