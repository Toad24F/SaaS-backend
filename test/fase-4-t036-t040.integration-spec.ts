import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { RELOJ } from '../src/comun/reloj';
import { conBaseMigrada } from './support/mariadb';
import { crearEscenarioPortal } from './support/escenario-portal';
import { RelojPrueba } from './support/reloj';

const AHORA = new Date('2026-10-20T12:00:00Z');

/** Dos negocios y una agenda real permiten probar HTTP sin credenciales. */
describe('M3-T036–T040: catálogo y disponibilidad pública', () => {
  it('filtra progresivamente la oferta efectiva sin revelar otro negocio', async () => {
    await conBaseMigrada(async (db) => {
      const reloj = new RelojPrueba(AHORA);
      const { negocios: [a, b] } = await crearEscenarioPortal(db, reloj);
      for (const negocio of [a, b]) await db.query(`INSERT INTO licencias
        (negocio_id,creado_en,habilitada_en,vence_en)
        VALUES (?,'2026-01-01','2026-01-01','2027-01-01')`, [negocio.id]);
      const servicioId = Number((await db.query('SELECT id FROM servicios WHERE negocio_id=? AND activo=1', [a.id]))[0].id);
      const servicioAjenoId = Number((await db.query('SELECT id FROM servicios WHERE negocio_id=? AND activo=1', [b.id]))[0].id);
      const modulo = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(DataSource).useValue(db).overrideProvider(RELOJ).useValue(reloj).compile();
      const app = modulo.createNestApplication();
      try {
        await app.init();
        const ruta = '/publico/negocios/portal-prueba-1/catalogo';
        const inicial = await request(app.getHttpServer()).get(ruta).expect(200);
        expect(inicial.body.negocio).toEqual({ slug: 'portal-prueba-1', nombre: 'Portal 1' });
        expect(inicial.body.servicios).toEqual([{ id: servicioId, nombre: 'Corte',
          costo: '100.00', duracionMinutos: 30 }]);
        expect(inicial.body.sucursales).toEqual([]);
        expect(inicial.body.profesionales).toEqual([]);
        const ramas = await request(app.getHttpServer()).get(ruta)
          .query({ servicioId }).expect(200);
        expect(ramas.body.sucursales.map((s: { id: number }) => s.id))
          .toEqual([a.sucursales[0].id]);
        const final = await request(app.getHttpServer()).get(ruta)
          .query({ servicioId, sucursalId: a.sucursales[0].id }).expect(200);
        expect(final.body.profesionales).toEqual([{ id: a.profesionales[0], nombre: 'Profesional 1-1' }]);
        const ajeno = await request(app.getHttpServer()).get(ruta)
          .query({ servicioId: servicioAjenoId }).expect(200);
        expect(ajeno.body.sucursales).toEqual([]);
        expect(ajeno.body.profesionales).toEqual([]);
        const sucursalAjena = await request(app.getHttpServer()).get(ruta)
          .query({ servicioId, sucursalId: b.sucursales[0].id }).expect(200);
        expect(sucursalAjena.body.profesionales).toEqual([]);
        expect(JSON.stringify(sucursalAjena.body)).not.toContain('Sucursal 2-0');
        expect(JSON.stringify(ajeno.body)).not.toMatch(/Portal 2|Profesional 2|portal2@|6141234567|rfc/i);
        await request(app.getHttpServer()).get(ruta).query({ sucursalId: a.sucursales[0].id }).expect(400);
        await request(app.getHttpServer()).get(ruta).query({ negocioId: a.id }).expect(400);
        await request(app.getHttpServer()).get('/publico/negocios/demo/catalogo').expect(404);
      } finally { await app.close(); }
    });
  }, 60000);

  it('publica ranuras, zona e instante y limita cada consulta a 31 fechas', async () => {
    await conBaseMigrada(async (db) => {
      const reloj = new RelojPrueba(AHORA);
      const { negocios: [a] } = await crearEscenarioPortal(db, reloj);
      await db.query(`INSERT INTO licencias (negocio_id,creado_en,habilitada_en,vence_en)
        VALUES (?,'2026-01-01','2026-01-01','2027-01-01')`, [a.id]);
      await db.query(`INSERT INTO configuracion_agenda
        (negocio_id,modo,intervalo_minutos,anticipacion_minutos,dias_futuros)
        VALUES (?,'ventana_libre',15,15,90)`, [a.id]);
      const servicioId = Number((await db.query('SELECT id FROM servicios WHERE negocio_id=? AND activo=1', [a.id]))[0].id);
      await db.query(`INSERT INTO horarios_personal
        (negocio_id,personal_id,sucursal_id,dia_semana,orden,inicio_minutos,fin_minutos,activo)
        VALUES (?,?,?,2,0,540,780,1)`, [a.id, a.profesionales[0], a.sucursales[0].id]);
      const modulo = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(DataSource).useValue(db).overrideProvider(RELOJ).useValue(reloj).compile();
      const app = modulo.createNestApplication();
      try {
        await app.init();
        const ruta = '/publico/negocios/portal-prueba-1/disponibilidad';
        const base = { personalId: a.profesionales[0], sucursalId: a.sucursales[0].id,
          servicioId, desde: '2026-10-20', hasta: '2026-10-20' };
        const respuesta = await request(app.getHttpServer()).get(ruta).query(base).expect(200);
        expect(respuesta.body.zonaHoraria).toBe('America/Chihuahua');
        expect(respuesta.body.calculadoEn).toBe(AHORA.toISOString());
        expect(respuesta.body.ranuras.length).toBeGreaterThan(0);
        expect(respuesta.body.reglas.diasFuturos).toBe(90);
        await request(app.getHttpServer()).get(ruta)
          .query({ ...base, hasta: '2026-11-19' }).expect(200);
        await request(app.getHttpServer()).get(ruta)
          .query({ ...base, hasta: '2026-11-20' }).expect(400);
        for (const extra of [{ modalidad: 'manual' }, { titularHash: 'x' },
          { negocioId: a.id }, { excluirApartadoId: 1 }]) {
          await request(app.getHttpServer()).get(ruta).query({ ...base, ...extra }).expect(400);
        }
      } finally { await app.close(); }
    });
  }, 60000);
});
