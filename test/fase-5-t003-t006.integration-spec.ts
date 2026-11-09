import { createConnection } from 'mysql2/promise';
import { getDatabaseOptions } from '../src/config/database.config';
import { conBaseOperativa, crearEscenarioOperativo, controlarEsperaOperativa } from './support/operacion-fase-5';
import { RelojPrueba } from './support/reloj';
import { ejecutarConFalloAntesDeCommit } from './support/concurrencia-portal';
import type { DataSource } from 'typeorm';

const AHORA = new Date('2026-11-08T12:00:00.000Z');

// Consulta de solo lectura fuera del esquema eliminado para verificar la limpieza real.
async function exigirBaseEliminada(nombre: string) {
  const opciones = getDatabaseOptions() as { host: string; port: number; username: string; password: string };
  const admin = await createConnection({ host: opciones.host, port: opciones.port,
    user: opciones.username, password: opciones.password });
  try {
    const [filas] = await admin.query('SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME=?', [nombre]);
    expect(filas).toEqual([]);
  } finally { await admin.end(); }
}

describe('M4-T003–T006: infraestructura operativa real', () => {
  it('rechaza la base cotidiana y configuración sin confirmación', () => {
    const env = { ...process.env, DB_NAME: 'cotidiana', TEST_DB_NAME: 'cotidiana', TEST_DB_CONFIRMED: 'cotidiana' };
    expect(() => getDatabaseOptions(env)).toThrow('separada');
    expect(() => getDatabaseOptions({ ...env, TEST_DB_NAME: 'm4_test' })).toThrow('confirmada');
  });

  it('crea, migra y destruye una base explícitamente test con dos conexiones independientes', async () => {
    let nombre = '';
    let conexiones: DataSource[] = [];
    await conBaseOperativa(async (a, b) => {
      conexiones = [a, b]; nombre = String(a.options.database);
      expect(nombre).toMatch(/^citas_m4_test_[a-f0-9]{32}$/);
      expect(b.options.database).toBe(nombre);
      expect((await a.query('SELECT CONNECTION_ID() id'))[0].id)
        .not.toBe((await b.query('SELECT CONNECTION_ID() id'))[0].id);
      expect((await a.query('SELECT name FROM migrations')).length).toBeGreaterThan(0);
    });
    expect(conexiones.every((c) => !c.isInitialized)).toBe(true);
    await exigirBaseEliminada(nombre);
  });

  it('siembra dos negocios, roles, zonas, Profesional multisucursal, estados y fichas independientes', async () => {
    let nombre = '';
    await conBaseOperativa(async (db) => {
      nombre = String(db.options.database);
      const { negocios } = await crearEscenarioOperativo(db, new RelojPrueba(AHORA));
      expect(negocios).toHaveLength(2);
      for (const negocio of negocios) {
        const usuarios = await db.query('SELECT DISTINCT rol FROM usuarios WHERE negocio_id=? ORDER BY rol', [negocio.id]);
        expect(new Set(usuarios.map((u: { rol: string }) => u.rol)))
          .toEqual(new Set(['admin_negocio', 'recepcionista', 'profesional']));
        const estados = await db.query('SELECT estado FROM citas WHERE negocio_id=?', [negocio.id]);
        expect(new Set(estados.map((c: { estado: string }) => c.estado)))
          .toEqual(new Set(['pendiente', 'confirmada', 'completada', 'cancelada', 'no_asistio']));
        const fichas = await db.query('SELECT id,nombre_completo,telefono FROM clientes WHERE negocio_id=?', [negocio.id]);
        expect(fichas).toHaveLength(2);
        expect(fichas[0].telefono).toBe(fichas[1].telefono);
        expect(fichas[0].nombre_completo).not.toBe(fichas[1].nombre_completo);
        const sedes = await db.query('SELECT sucursal_id FROM personal_sucursales WHERE negocio_id=? AND personal_id=? AND activo=1', [negocio.id, negocio.profesionales[0]]);
        expect(sedes).toHaveLength(2);
        expect(new Set(negocio.sucursales.map((s) => s.zona)).size).toBe(2);
      }
      expect(await db.query('SELECT id FROM citas WHERE negocio_id=? AND personal_id=?',
        [negocios[0].id, negocios[1].profesionales[0]])).toEqual([]);
    });
    await exigirBaseEliminada(nombre);
  });

  it('rechaza fixtures en destinos que no creó el ejecutor', async () => {
    await expect(crearEscenarioOperativo({ options: { database: 'citas_test_cotidiana' } } as DataSource,
      new RelojPrueba(AHORA))).rejects.toThrow('base operativa desechable');
  });

  it('fija antes, en y después de cada límite y revierte una escritura real', async () => {
    await conBaseOperativa(async (db) => {
      const reloj = new RelojPrueba(AHORA);
      // Apartado, fin de atención, inicio/cupo y plazo de licencia usan el mismo reloj inyectable.
      for (const delta of [300_000, 1_800_000, 3_600_000, 2 * 86_400_000]) {
        const limite = AHORA.getTime() + delta;
        for (const diferencia of [-1, 0, 1]) {
          reloj.fijar(new Date(limite + diferencia));
          expect(reloj.ahora().getTime()).toBe(limite + diferencia);
        }
      }
      await expect(ejecutarConFalloAntesDeCommit(db, async (manager) => {
        await manager.query("INSERT INTO negocios(nombre,slug,email_contacto) VALUES('Rollback','m4-rollback','m4@example.test')");
      })).rejects.toThrow('Fallo de prueba antes del commit');
      expect(await db.query("SELECT id FROM negocios WHERE slug='m4-rollback'")).toEqual([]);
    });
  });

  it('observa espera InnoDB y continuación tras liberar la fila común del Profesional', async () => {
    await conBaseOperativa(async (a, b) => {
      const { negocios: [negocio] } = await crearEscenarioOperativo(a, new RelojPrueba(AHORA));
      const resultado = await controlarEsperaOperativa(a, b, negocio.profesionales[0]);
      expect(resultado.esperaObservada).toBe(true);
      expect(resultado.continuo).toBe(true);
      expect(resultado.conexiones[0]).not.toBe(resultado.conexiones[1]);
    });
  });

  it('revierte y cierra ambas conexiones y la base si falla mientras hay espera', async () => {
    let nombre = '';
    let conexiones: DataSource[] = [];
    await expect(conBaseOperativa(async (a, b) => {
      conexiones = [a, b]; nombre = String(a.options.database);
      const { negocios: [negocio] } = await crearEscenarioOperativo(a, new RelojPrueba(AHORA));
      const [antes] = await a.query('SELECT especialidad FROM personal WHERE id=?', [negocio.profesionales[0]]);
      try {
        await controlarEsperaOperativa(a, b, negocio.profesionales[0], true);
      } finally {
        expect((await a.query('SELECT especialidad FROM personal WHERE id=?', [negocio.profesionales[0]]))[0])
          .toEqual(antes);
      }
    })).rejects.toThrow('Fallo controlado durante espera');
    expect(conexiones.every((c) => !c.isInitialized)).toBe(true);
    await exigirBaseEliminada(nombre);
  });
});
