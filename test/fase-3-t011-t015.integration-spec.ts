import { conBaseMigrada } from './support/mariadb';
import { conBaseHistorica, crearDatosOcupaciones } from './support/ocupaciones-fase-3';
import { RelojPrueba } from './support/reloj';
import { BloqueoTemporal } from '../src/disponibilidad/entities/bloqueo-temporal.entity';

describe('M2-T011–T015: entidad, datos y continuidad de instalación', () => {
  it('crea ocupaciones en dos negocios y conserva milisegundos y liberación anulable', async () => {
    await conBaseMigrada(async (db) => {
      const reloj = new RelojPrueba(new Date('2026-10-20T15:00:00.123Z'));
      const escenario = await crearDatosOcupaciones(db, reloj);
      expect(escenario.negocios).toHaveLength(2);
      for (const negocio of escenario.negocios) {
        expect(negocio.sucursales).toHaveLength(2);
        expect(negocio.servicios).toHaveLength(2);
        expect(negocio.citas).toHaveLength(2);
        expect(negocio.apartados).toHaveLength(2);
      }
      const [uno, dos] = escenario.negocios;
      expect(uno.id).not.toBe(dos.id);
      const repo = db.getRepository(BloqueoTemporal);
      const apartado = await repo.findOneOrFail({ where: { id: uno.apartados[0] },
        relations: { negocio: true, personal: true, sucursal: true, servicio: true } });
      expect(apartado.inicioUtc.toISOString()).toBe('2026-10-20T15:00:00.123Z');
      expect(apartado.finUtc.toISOString()).toBe('2026-10-20T15:30:00.789Z');
      expect(apartado.expiraEn.toISOString()).toBe('2026-10-20T15:05:00.123Z');
      expect(apartado.liberadoEn).toBeNull();
      expect([apartado.negocio.id, apartado.personal.negocioId,
        apartado.sucursal.negocioId, apartado.servicio.negocioId])
        .toEqual([uno.id, uno.id, uno.id, uno.id]);
      apartado.liberadoEn = reloj.ahora();
      await repo.save(apartado);
      expect((await repo.findOneByOrFail({ id: apartado.id })).liberadoEn?.toISOString())
        .toBe(reloj.ahora().toISOString());
      expect(await db.getRepository(BloqueoTemporal).countBy({ negocioId: dos.id }))
        .toBe(2);
    });
  });

  it('detiene la migración ante citas antiguas y conserva su dato sin convertirlo', async () => {
    await conBaseHistorica(async ({ db, actualizar }) => {
      // Simula la tabla local instalada antes de fase 3, sin asumir su zona.
      await db.query(`CREATE TABLE citas (id INT UNSIGNED PRIMARY KEY,
        fecha DATE NOT NULL, hora_inicio TIME NOT NULL, hora_fin TIME NOT NULL)`);
      await db.query(`INSERT INTO citas (id,fecha,hora_inicio,hora_fin)
        VALUES (7,'2026-10-20','09:00:00','09:30:00')`);
      await expect(actualizar()).rejects.toThrow();
      expect(await db.query('SELECT id, fecha, hora_inicio, hora_fin FROM citas'))
        .toHaveLength(1);
      const columnas = await db.query('SHOW COLUMNS FROM citas');
      expect(columnas.map((fila: { Field: string }) => fila.Field))
        .toEqual(['id', 'fecha', 'hora_inicio', 'hora_fin']);
      expect(await db.query("SELECT name FROM migrations WHERE name = 'CitasCanonicas1760000021000'"))
        .toEqual([]);
    });
  });

  it('detiene la migración ante apartados antiguos y conserva el dato sin convertirlo', async () => {
    await conBaseHistorica(async ({ db, actualizar }) => {
      await db.query(`CREATE TABLE bloqueos_temporales
        (id INT UNSIGNED PRIMARY KEY, fecha DATE NOT NULL, session_token VARCHAR(100) NOT NULL)`);
      await db.query(`INSERT INTO bloqueos_temporales (id,fecha,session_token)
        VALUES (9,'2026-10-20','token-solo-de-prueba')`);
      await expect(actualizar()).rejects.toThrow();
      expect(await db.query('SELECT id, fecha, session_token FROM bloqueos_temporales'))
        .toHaveLength(1);
      const columnas = await db.query('SHOW COLUMNS FROM bloqueos_temporales');
      expect(columnas.map((fila: { Field: string }) => fila.Field))
        .toEqual(['id', 'fecha', 'session_token']);
      expect(await db.query("SELECT name FROM migrations WHERE name = 'ApartadosCanonicos1760000022000'"))
        .toEqual([]);
    });
  });
});
