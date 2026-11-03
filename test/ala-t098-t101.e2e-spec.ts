import { INestApplication, ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { RELOJ } from '../src/comun/reloj';
import { AtencionInternaService } from '../src/disponibilidad/atencion-interna.service';
import { conBaseMigrada } from './support/mariadb';
import { crearEscenarioPortal } from './support/escenario-portal';
import { RelojPrueba } from './support/reloj';

const RUTA = '/publico/negocios/portal-prueba-1';
const ORIGEN = 'https://citas.example.test';
const fecha = '2026-10-20';

/** Aísla cada contrato HTTP en una base migrada y con reloj del servidor fijo. */
async function escenario(ejecutar: (datos: { app: INestApplication; db: DataSource;
  reloj: RelojPrueba; personalId: number; sucursalId: number;
  servicioId: number }) => Promise<void>) {
  await conBaseMigrada(async (db) => {
    const reloj = new RelojPrueba(new Date('2026-10-20T12:00:00.000Z'));
    const { negocios: [negocio] } = await crearEscenarioPortal(db, reloj);
    await db.query(`INSERT INTO licencias
      (negocio_id,creado_en,habilitada_en,vence_en)
      VALUES (?,'2026-01-01','2026-01-01','2027-01-01')`, [negocio.id]);
    await db.query(`INSERT INTO configuracion_agenda
      (negocio_id,modo,tiempo_entre_citas_minutos,anticipacion_minutos,dias_futuros)
      VALUES (?,'agenda_compacta',0,15,1)`, [negocio.id]);
    const personalId = negocio.profesionales[0];
    const sucursalId = negocio.sucursales[0].id;
    const servicioId = Number((await db.query(`SELECT id FROM servicios
      WHERE negocio_id=? AND activo=1`, [negocio.id]))[0].id);
    // Martes y miércoles tienen mañana y tarde; Compacta debe agrupar por fecha.
    for (const dia of [2, 3]) for (const [orden, inicio, fin] of [
      [0, 540, 600], [1, 840, 900],
    ]) await db.query(`INSERT INTO horarios_personal
      (negocio_id,personal_id,sucursal_id,dia_semana,orden,inicio_minutos,fin_minutos,activo)
      VALUES (?,?,?,?,?,?,?,1)`, [negocio.id, personalId, sucursalId,
      dia, orden, inicio, fin]);
    const anterior = { origen: process.env.PORTAL_PUBLICO_ORIGEN,
      secreto: process.env.PORTAL_CSRF_SECRET };
    process.env.PORTAL_PUBLICO_ORIGEN = ORIGEN;
    process.env.PORTAL_CSRF_SECRET = 'secreto-de-pruebas-del-portal-de-32-caracteres';
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DataSource).useValue(db).overrideProvider(RELOJ).useValue(reloj).compile();
    const app = modulo.createNestApplication();
    try {
      await app.init();
      await ejecutar({ app, db, reloj, personalId, sucursalId, servicioId });
    } finally {
      await app.close();
      process.env.PORTAL_PUBLICO_ORIGEN = anterior.origen;
      process.env.PORTAL_CSRF_SECRET = anterior.secreto;
    }
  });
}

describe('ALA-T098–T101: consulta y concesión con estrategia compartida', () => {
  it('muestra solo el primer inicio de mañana por fecha y conserva el otro día', async () => {
    await escenario(async ({ app, personalId, sucursalId, servicioId }) => {
      const respuesta = await request(app.getHttpServer()).get(`${RUTA}/disponibilidad`)
        .query({ personalId, sucursalId, servicioId, desde: fecha,
          hasta: '2026-10-21' }).expect(200);
      expect(respuesta.body.ranuras.map((x: { inicioUtc: string }) => x.inicioUtc))
        .toEqual(['2026-10-20T15:00:00.000Z', '2026-10-21T15:00:00.000Z']);
    });
  });

  it('un apartado mueve Compacta al siguiente inicio; liberar y vencer restauran el anterior', async () => {
    await escenario(async ({ app, reloj, personalId, sucursalId, servicioId }) => {
      const http = app.getHttpServer();
      const consulta = () => request(http).get(`${RUTA}/disponibilidad`)
        .query({ personalId, sucursalId, servicioId, desde: fecha, hasta: fecha });
      const sesion = await request(http).post(`${RUTA}/sesion`).set('Origin', ORIGEN)
        .set('X-Portal-Inicializacion', '1').expect(201);
      const cookie = sesion.headers['set-cookie'][0].split(';')[0];
      const csrf = sesion.body.csrfToken as string;
      const crear = (clave: string, horaInicio: string) => request(http)
        .post(`${RUTA}/apartados`).set('Origin', ORIGEN).set('Cookie', cookie)
        .set('X-CSRF-Token', csrf).send({ clave, personalId, sucursalId,
          servicioId, fechaLocal: fecha, horaInicio });
      const primero = await crear('compacta_primero_123', '09:00').expect(201);
      expect((await consulta().expect(200)).body.ranuras[0].inicioUtc)
        .toBe('2026-10-20T15:30:00.000Z');
      await request(http).post(`${RUTA}/apartados/${primero.body.apartadoId}/liberar`)
        .set('Origin', ORIGEN).set('Cookie', cookie).set('X-CSRF-Token', csrf)
        .send({ generacion: primero.body.generacion }).expect(204);
      expect((await consulta().expect(200)).body.ranuras[0].inicioUtc)
        .toBe('2026-10-20T15:00:00.000Z');
      await crear('compacta_segundo_123', '09:00').expect(201);
      reloj.avanzar(300000);
      expect((await consulta().expect(200)).body.ranuras[0].inicioUtc)
        .toBe('2026-10-20T15:00:00.000Z');
    });
  });

  it('consulta y nueva concesión usan la misma estrategia y rechazan reglas del navegador', async () => {
    await escenario(async ({ app, db, personalId, sucursalId, servicioId }) => {
      const http = app.getHttpServer();
      const sesion = await request(http).post(`${RUTA}/sesion`).set('Origin', ORIGEN)
        .set('X-Portal-Inicializacion', '1').expect(201);
      const cookie = sesion.headers['set-cookie'][0].split(';')[0];
      const csrf = sesion.body.csrfToken as string;
      const cuerpo = { clave: 'estrategia_publica_123', personalId, sucursalId,
        servicioId, fechaLocal: fecha, horaInicio: '09:30' };
      const crear = (datos: Record<string, unknown>) => request(http)
        .post(`${RUTA}/apartados`).set('Origin', ORIGEN).set('Cookie', cookie)
        .set('X-CSRF-Token', csrf).send(datos);
      await crear(cuerpo).expect(409);
      for (const campo of ['modalidad', 'separacionMinutos', 'costoAceptado']) {
        await crear({ ...cuerpo, [campo]: campo === 'modalidad' ? 'manual' : 0 })
          .expect(400);
      }
      await db.query(`UPDATE configuracion_agenda SET modo='ventana_libre'
        WHERE negocio_id=(SELECT id FROM negocios WHERE slug='portal-prueba-1')`);
      const ranuras = (await request(http).get(`${RUTA}/disponibilidad`)
        .query({ personalId, sucursalId, servicioId, desde: fecha,
          hasta: fecha }).expect(200)).body.ranuras;
      expect(ranuras.map((x: { inicioUtc: string }) => x.inicioUtc))
        .toContain('2026-10-20T15:30:00.000Z');
      await crear({ ...cuerpo, clave: 'estrategia_libre_123' }).expect(201);
    });
  });

  it('Agenda Libre avanza por duración real y concede solo los inicios ofrecidos', async () => {
    await escenario(async ({ app, db, personalId, sucursalId, servicioId }) => {
      await db.query(`UPDATE configuracion_agenda SET modo='ventana_libre'
        WHERE negocio_id=(SELECT id FROM negocios WHERE slug='portal-prueba-1')`);
      await db.query('UPDATE servicios SET duracion_minutos=32 WHERE id=?', [servicioId]);
      await db.query(`UPDATE horarios_personal SET fin_minutos=615
        WHERE personal_id=? AND sucursal_id=? AND dia_semana=2 AND orden=0`,
      [personalId, sucursalId]);
      const http = app.getHttpServer();
      const seleccion = { personalId, sucursalId, servicioId, desde: fecha, hasta: fecha };
      const inicios = (await request(http).get(`${RUTA}/disponibilidad`)
        .query(seleccion).expect(200)).body.ranuras
        .map((x: { inicioUtc: string }) => x.inicioUtc);
      expect(inicios.slice(0, 2))
        .toEqual(['2026-10-20T15:00:00.000Z', '2026-10-20T15:35:00.000Z']);
      expect(inicios).not.toContain('2026-10-20T15:05:00.000Z');
      const sesion = await request(http).post(`${RUTA}/sesion`).set('Origin', ORIGEN)
        .set('X-Portal-Inicializacion', '1').expect(201);
      const crear = (clave: string, horaInicio: string) => request(http)
        .post(`${RUTA}/apartados`).set('Origin', ORIGEN)
        .set('Cookie', sesion.headers['set-cookie'][0].split(';')[0])
        .set('X-CSRF-Token', sesion.body.csrfToken).send({ clave, personalId,
          sucursalId, servicioId, fechaLocal: fecha, horaInicio });
      await crear('libre_no_ofrecido_123', '09:05').expect(409);
      await crear('libre_ofrecido_123', '09:35').expect(201);
    });
  });

  it('devuelve 200 vacío correcto y 500/503 seguros sin ranuras parciales', async () => {
    await escenario(async ({ app, personalId, sucursalId, servicioId }) => {
      const http = app.getHttpServer();
      const query = { personalId, sucursalId, servicioId,
        desde: '2026-10-22', hasta: '2026-10-22' };
      expect((await request(http).get(`${RUTA}/disponibilidad`)
        .query(query).expect(200)).body.ranuras).toEqual([]);
      const fuente = app.get(AtencionInternaService);
      const original = fuente.consultar.bind(fuente);
      try {
        jest.spyOn(fuente, 'consultar').mockRejectedValueOnce(new Error('SQL privado'));
        const inesperado = await request(http).get(`${RUTA}/disponibilidad`)
          .query({ ...query, desde: fecha, hasta: fecha }).expect(500);
        expect(inesperado.body).toMatchObject({ codigo: 'portal_500' });
        expect(inesperado.body).not.toHaveProperty('ranuras');
        expect(JSON.stringify(inesperado.body)).not.toContain('SQL privado');
        jest.spyOn(fuente, 'consultar').mockRejectedValueOnce(
          new ServiceUnavailableException('lector temporal'));
        const temporal = await request(http).get(`${RUTA}/disponibilidad`)
          .query({ ...query, desde: fecha, hasta: fecha }).expect(503);
        expect(temporal.body).toMatchObject({ codigo: 'portal_503' });
        expect(temporal.body).not.toHaveProperty('ranuras');
      } finally { fuente.consultar = original; }
    });
  });
});
