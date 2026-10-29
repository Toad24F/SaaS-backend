import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { createHmac } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { RELOJ } from '../src/comun/reloj';
import { conBaseMigrada } from './support/mariadb';
import { crearEscenarioPortal } from './support/escenario-portal';
import { RelojPrueba } from './support/reloj';

const AHORA = new Date('2026-10-20T12:00:00Z');
const ORIGEN = 'https://citas.example.test';
const RUTA = '/publico/negocios/portal-prueba-1';

/** Recorre las tres rutas con sesión real, base migrada y reloj inyectado. */
describe('M3-T063–T064: estado y rutas públicas de apartado', () => {
  it('crea, consulta vigencia y distingue liberado, sustituido y vencido', async () => {
    await conBaseMigrada(async (db) => {
      const reloj = new RelojPrueba(AHORA);
      const { negocios: [a, b] } = await crearEscenarioPortal(db, reloj);
      for (const negocio of [a, b]) await db.query(`INSERT INTO licencias
        (negocio_id,creado_en,habilitada_en,vence_en)
        VALUES (?,'2026-01-01','2026-01-01','2027-01-01')`, [negocio.id]);
      await db.query(`INSERT INTO horarios_personal (negocio_id,personal_id,sucursal_id,
        dia_semana,orden,inicio_minutos,fin_minutos,activo)
        VALUES (?,?,?,2,0,480,720,1)`, [a.id, a.profesionales[0], a.sucursales[0].id]);
      const servicioId = Number((await db.query('SELECT id FROM servicios WHERE negocio_id=? AND activo=1',
        [a.id]))[0].id);
      const anterior = { origen: process.env.PORTAL_PUBLICO_ORIGEN,
        secreto: process.env.PORTAL_CSRF_SECRET };
      process.env.PORTAL_PUBLICO_ORIGEN = ORIGEN;
      process.env.PORTAL_CSRF_SECRET = 'secreto-de-pruebas-del-portal-de-32-caracteres';
      const modulo = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(DataSource).useValue(db)
        .overrideProvider(RELOJ).useValue(reloj).compile();
      const app = modulo.createNestApplication();
      try {
        await app.init();
        const http = app.getHttpServer();
        const iniciar = async () => {
          const respuesta = await request(http).post(`${RUTA}/sesion`)
            .set('Origin', ORIGEN).set('X-Portal-Inicializacion', '1').expect(201);
          return { cookie: respuesta.headers['set-cookie'][0].split(';')[0],
            csrf: respuesta.body.csrfToken as string };
        };
        const sesion = await iniciar();
        const ajena = await iniciar();
        const credencialAjena = 'A'.repeat(43);
        const caduca = { cookie: `reserva_sesion=${credencialAjena}`,
          csrf: createHmac('sha256', process.env.PORTAL_CSRF_SECRET!)
            .update(`portal-csrf:${credencialAjena}`).digest('hex') };
        const seleccionar = (clave: string, horaInicio: string) => ({ clave,
          personalId: a.profesionales[0], sucursalId: a.sucursales[0].id,
          servicioId, fechaLocal: '2026-10-20', horaInicio });
        const crear = (cuerpo: unknown, identidad = sesion) => request(http)
          .post(`${RUTA}/apartados`).set('Origin', ORIGEN)
          .set('Cookie', identidad.cookie).set('X-CSRF-Token', identidad.csrf).send(cuerpo);
        const consultar = (id: number, identidad = sesion) => request(http)
          .get(`${RUTA}/apartados/${id}`).set('Cookie', identidad.cookie);
        const liberar = (id: number, generacion: string, identidad = sesion) => request(http)
          .post(`${RUTA}/apartados/${id}/liberar`).set('Origin', ORIGEN)
          .set('Cookie', identidad.cookie).set('X-CSRF-Token', identidad.csrf)
          .send({ generacion });

        // La credencial y el origen se exigen antes de tocar un apartado.
        await request(http).post(`${RUTA}/apartados`).send(seleccionar('apartado_1234567890', '08:00'))
          .expect(401);
        await request(http).get(`${RUTA}/apartados/1`).expect(401);
        await request(http).get(`${RUTA}/apartados/1`)
          .set('Cookie', caduca.cookie).expect(401);
        await crear({ ...seleccionar('apartado_1234567890', '08:00'), costo: 1 }).expect(400);
        await crear({ ...seleccionar('apartado_1234567890', '08:00'),
          personalId: b.profesionales[0] }).expect(404);
        await request(http).post(`${RUTA}/apartados`).set('Cookie', sesion.cookie)
          .set('Origin', ORIGEN).send(seleccionar('apartado_1234567890', '08:00'))
          .expect(403);
        const primera = await crear(seleccionar('apartado_1234567890', '08:00')).expect(201);
        expect(primera.body).toMatchObject({ estado: 'concedida', generacion: '1',
          costoAceptado: '100.00', servidorAhora: AHORA.toISOString() });
        expect(primera.body.expiraEn).toBe('2026-10-20T12:05:00.000Z');
        expect(primera.headers['cache-control']).toBe('no-store');
        const id = primera.body.apartadoId as number;
        await crear(seleccionar('apartado_1234567890', '08:00'), caduca).expect(401);
        const vigente = await consultar(id).expect(200);
        expect(vigente.body).toMatchObject({ apartadoId: id, estado: 'vigente',
          generacion: '1', expiraEn: primera.body.expiraEn,
          servidorAhora: AHORA.toISOString() });
        expect(vigente.headers['cache-control']).toBe('no-store');
        await consultar(id, ajena).expect(404);
        await liberar(id, '1', ajena).expect(404);
        await liberar(id, '2').expect(404);
        await liberar(id, '1', caduca).expect(401);
        await liberar(id, '1').expect(204);
        await liberar(id, '1').expect(204);
        expect((await consultar(id).expect(200)).body.estado).toBe('liberado');

        const segunda = await crear(seleccionar('apartado_2345678901', '09:00')).expect(201);
        const segundoId = segunda.body.apartadoId as number;
        const tercera = await crear(seleccionar('apartado_3456789012', '10:00')).expect(201);
        expect((await consultar(segundoId).expect(200)).body.estado).toBe('sustituido');
        await liberar(segundoId, '2').expect(204);
        expect((await consultar(tercera.body.apartadoId).expect(200)).body.estado)
          .toBe('vigente');
        reloj.fijar(new Date('2026-10-20T12:05:00.000Z'));
        expect((await consultar(tercera.body.apartadoId).expect(200)).body)
          .toMatchObject({ estado: 'vencido', servidorAhora: reloj.ahora().toISOString() });
        expect((await crear(seleccionar('apartado_3456789012', '10:00')).expect(200))
          .body.expiraEn).toBe(tercera.body.expiraEn);

        // La suspensión corta nuevas concesiones, pero no impide liberar lo propio.
        await db.query('UPDATE licencias SET vence_en=? WHERE negocio_id=?', [AHORA, a.id]);
        await crear(seleccionar('apartado_4567890123', '11:00')).expect(404);
        await liberar(tercera.body.apartadoId, '3').expect(204);
        expect((await db.query('SELECT liberado_en FROM bloqueos_temporales WHERE id=?',
          [tercera.body.apartadoId]))[0].liberado_en).not.toBeNull();
      } finally {
        await app.close();
        process.env.PORTAL_PUBLICO_ORIGEN = anterior.origen;
        process.env.PORTAL_CSRF_SECRET = anterior.secreto;
      }
    });
  }, 120000);
});
