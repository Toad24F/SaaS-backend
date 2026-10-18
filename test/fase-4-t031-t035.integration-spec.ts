import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { RELOJ } from '../src/comun/reloj';
import { MotorDisponibilidadService } from '../src/disponibilidad/motor-disponibilidad.service';
import { SesionesService } from '../src/auth/services/sesiones.service';
import { Rol } from '../src/auth/enums/rol.enum';
import { resolverInstanteLocal } from '../src/horarios/calendario';
import { ResolverNegocioPublicoService } from '../src/reservas-publicas/resolver-negocio-publico.service';
import { conBaseMigrada } from './support/mariadb';
import { crearEscenarioPortal } from './support/escenario-portal';
import { RelojPrueba } from './support/reloj';

const AHORA = new Date('2026-10-20T12:00:00Z');
const FECHA = '2026-10-20';

/** Las pruebas usan dos tenants reales y una única agenda activa en la base temporal. */
async function escenario(ejecutar: (datos: {
  db: DataSource; app: INestApplication; reloj: RelojPrueba;
  a: { id: number; personalId: number; sucursalId: number; servicioId: number };
  b: { id: number; personalId: number };
  tokenPrivado: { sub: number; sesionId: string }; jwt: string;
}) => Promise<void>) {
  await conBaseMigrada(async (db) => {
    const reloj = new RelojPrueba(AHORA);
    const { negocios: [primero, segundo] } = await crearEscenarioPortal(db, reloj);
    for (const negocio of [primero, segundo]) {
      await db.query(`INSERT INTO licencias
        (negocio_id,creado_en,habilitada_en,vence_en)
        VALUES (?,'2026-01-01','2026-01-01','2027-01-01')`, [negocio.id]);
    }
    const a = { id: primero.id, personalId: primero.profesionales[0],
      sucursalId: primero.sucursales[0].id,
      servicioId: Number((await db.query(`SELECT id FROM servicios
        WHERE negocio_id=? AND activo=1 LIMIT 1`, [primero.id]))[0].id) };
    const b = { id: segundo.id, personalId: segundo.profesionales[0] };
    await db.query(`INSERT INTO horarios_personal
      (negocio_id,personal_id,sucursal_id,dia_semana,orden,
       inicio_minutos,fin_minutos,activo) VALUES (?,?,?,2,0,540,780,1)`,
    [a.id, a.personalId, a.sucursalId]);
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DataSource).useValue(db)
      .overrideProvider(RELOJ).useValue(reloj).compile();
    const app = modulo.createNestApplication();
    const registros: string[] = [];
    // Captura registros durante las peticiones; ningún secreto de HTTP debe llegar aquí.
    app.useLogger({ log: (m) => { registros.push(String(m)); },
      error: (m) => { registros.push(String(m)); },
      warn: (m) => { registros.push(String(m)); },
      debug: (m) => { registros.push(String(m)); },
      verbose: (m) => { registros.push(String(m)); } });
    try {
      await app.init();
      const sesion = await app.get(SesionesService).crear(a.personalId, AHORA);
      const tokenPrivado = { sub: a.personalId, sesionId: sesion.id };
      const jwt = app.get(JwtService).sign({ ...tokenPrivado,
        rol: Rol.PROFESIONAL, negocioId: a.id });
      await ejecutar({ db, app, reloj, a, b, tokenPrivado, jwt });
      expect(registros.join(' ')).not.toMatch(/reserva_sesion|6141234567|titular_hash|csrfToken|secreto-privado-m3/i);
    } finally { await app.close(); }
  });
}

describe('M3-T031–T035: motor compartido y regresión privada', () => {
  it('calcula las mismas ranuras públicas sin JWT y conserva permisos privados', async () => {
    await escenario(async ({ app, db, reloj, a, b, tokenPrivado }) => {
      const motor = app.get(MotorDisponibilidadService);
      const privado = await motor.consultar(tokenPrivado, a.personalId,
        a.sucursalId, a.servicioId, FECHA, FECHA);
      const publico = await motor.consultarPublico(a.id, a.personalId,
        a.sucursalId, a.servicioId, FECHA, FECHA);
      expect(publico.modalidad).toBe('publica');
      expect(publico.ranuras).toEqual(privado.ranuras);
      expect(publico.ranuras.length).toBeGreaterThan(0);
      await expect(motor.consultarPublico(a.id, b.personalId,
        a.sucursalId, a.servicioId, FECHA, FECHA)).rejects.toMatchObject({ status: 404 });
      await expect(motor.consultar({ sub: tokenPrivado.sub,
        sesionId: 'revocada' }, a.personalId, a.sucursalId,
      a.servicioId, FECHA, FECHA)).rejects.toMatchObject({ status: 401 });
      await db.query('UPDATE licencias SET vence_en=? WHERE negocio_id=?', [AHORA, a.id]);
      await expect(motor.consultarPublico(a.id, a.personalId,
        a.sucursalId, a.servicioId, FECHA, FECHA)).rejects.toMatchObject({ status: 404 });
      reloj.fijar(new Date('2026-10-20T12:01:00Z'));
    });
  }, 60000);

  it('revalida en el manager del escritor y excluye solo el apartado propio exacto', async () => {
    await escenario(async ({ app, db, a, b }) => {
      const motor = app.get(MotorDisponibilidadService);
      const inicio = resolverInstanteLocal(FECHA, 600, 'America/Chihuahua');
      const fin = new Date(inicio.getTime() + 30 * 60000);
      const hash = 'a'.repeat(64);
      const apartado = await db.query(`INSERT INTO bloqueos_temporales
        (negocio_id,personal_id,sucursal_id,servicio_id,inicio_utc,fin_utc,
         expira_en,titular_hash) VALUES (?,?,?,?,?,?,?,?)`,
      [a.id, a.personalId, a.sucursalId, a.servicioId, inicio, fin,
        new Date(AHORA.getTime() + 300000), hash]);
      const entrada = { personalId: a.personalId, sucursalId: a.sucursalId,
        servicioId: a.servicioId, fechaLocal: FECHA, horaInicio: '10:00',
        apartadoPropio: { id: Number(apartado.insertId), titularHash: hash } };
      await expect(motor.revalidarPublicoEnTransaccion(db.manager,
        a.id, entrada)).rejects.toThrow('transacción activa');
      const transacciones = jest.spyOn(db, 'transaction');
      await db.transaction('READ COMMITTED', async (manager) => {
        const valido = await motor.revalidarPublicoEnTransaccion(manager, a.id, entrada);
        expect(valido).toMatchObject({ valido: true, modalidad: 'publica',
          inicioUtc: inicio, finUtc: fin });
        const modalidadInyectada = await motor.revalidarPublicoEnTransaccion(
          manager, a.id, { ...entrada, modalidad: 'manual' } as typeof entrada);
        expect(modalidadInyectada.modalidad).toBe('publica');
        const ajeno = await motor.revalidarPublicoEnTransaccion(manager, a.id,
          { ...entrada, apartadoPropio: { ...entrada.apartadoPropio,
            titularHash: 'b'.repeat(64) } });
        expect(ajeno.valido).toBe(false);
        expect(ajeno.motivos).toContain('apartado_no_vigente_o_incompatible');
        await expect(motor.revalidarPublicoEnTransaccion(manager, b.id, entrada))
          .rejects.toMatchObject({ status: 404 });
      });
      expect(transacciones).toHaveBeenCalledTimes(1);
      transacciones.mockRestore();
      expect((await db.query('SELECT liberado_en FROM bloqueos_temporales WHERE id=?',
        [apartado.insertId]))[0].liberado_en).toBeNull();
    });
  }, 60000);

  it('mantiene cinco rutas privadas y protege cookie, origen y privacidad HTTP', async () => {
    await escenario(async ({ app, jwt, a, b }) => {
      const http = app.getHttpServer();
      const base = { personalId: a.personalId, sucursalId: a.sucursalId,
        servicioId: a.servicioId };
      const auth = (peticion: request.Test) => peticion.auth(jwt, { type: 'bearer' });
      await request(http).get('/disponibilidad/configuracion').expect(401);
      await auth(request(http).get('/disponibilidad/configuracion')).expect(403);
      await auth(request(http).put('/disponibilidad/configuracion'))
        .send({ modo: 'ventana_libre', intervaloMinutos: 15,
          anticipacionMinutos: 15, diasFuturos: 60 }).expect(403);
      await auth(request(http).get('/disponibilidad').query({ ...base,
        desde: FECHA, hasta: FECHA })).expect(200);
      await auth(request(http).post('/disponibilidad/validar').send({ ...base,
        fechaLocal: FECHA, horaInicio: '10:00', modalidad: 'manual' })).expect(200);
      await auth(request(http).get('/disponibilidad/citas-afectadas')
        .query({ personalId: a.personalId, desde: FECHA, hasta: FECHA })).expect(200);
      await auth(request(http).get('/disponibilidad').query({ ...base,
        personalId: b.personalId, desde: FECHA, hasta: FECHA })).expect(404);
      await request(http).get('/publico/negocios/portal-prueba-1/disponibilidad')
        .query({ ...base, desde: FECHA, hasta: FECHA, modalidad: 'manual' }).expect(404);
      const original = { origen: process.env.PORTAL_PUBLICO_ORIGEN,
        secreto: process.env.PORTAL_CSRF_SECRET };
      process.env.PORTAL_PUBLICO_ORIGEN = 'https://citas.example.test';
      process.env.PORTAL_CSRF_SECRET = 'clave-del-portal-para-pruebas-con-mas-de-32';
      try {
        const ruta = '/publico/negocios/portal-prueba-1/sesion';
        const inicio = await request(http).post(ruta)
          .set('Origin', 'https://citas.example.test')
          .set('X-Portal-Inicializacion', '1').expect(201);
        expect(inicio.headers['cache-control']).toBe('no-store');
        const cookie = inicio.headers['set-cookie'][0].split(';')[0];
        await request(http).post(ruta).set('Origin', 'https://ajeno.example.test')
          .set('Cookie', cookie).set('X-Portal-Inicializacion', '1').expect(403);
        const invalida = await request(http).post(ruta)
          .set('Origin', 'https://citas.example.test')
          .set('Cookie', 'reserva_sesion=invalida')
          .set('X-Portal-Inicializacion', '1').expect(401);
        expect(invalida.headers['cache-control']).toBe('no-store');
        expect(JSON.stringify(invalida.body)).not.toMatch(/rfc|correo|6141234567|titular_hash/i);
        const resolver = app.get(ResolverNegocioPublicoService);
        const fallo = jest.spyOn(resolver, 'resolver')
          .mockRejectedValueOnce(new Error('secreto-privado-m3 6141234567'));
        const tecnica = await request(http).post(ruta)
          .set('Origin', 'https://citas.example.test')
          .set('Cookie', cookie)
          .set('X-Portal-Inicializacion', '1').expect(500);
        expect(tecnica.headers['cache-control']).toBe('no-store');
        expect(JSON.stringify(tecnica.body)).not.toMatch(/secreto-privado-m3|6141234567/i);
        fallo.mockRestore();
      } finally {
        process.env.PORTAL_PUBLICO_ORIGEN = original.origen;
        process.env.PORTAL_CSRF_SECRET = original.secreto;
      }
    });
  }, 60000);
});
