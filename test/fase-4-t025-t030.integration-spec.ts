import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { RELOJ } from '../src/comun/reloj';
import { ContextoDisponibilidadService } from '../src/disponibilidad/contexto-disponibilidad.service';
import { ResolverNegocioPublicoService } from '../src/reservas-publicas/resolver-negocio-publico.service';
import { conBaseMigrada } from './support/mariadb';
import { RelojPrueba } from './support/reloj';
import { crearEscenarioPortal } from './support/escenario-portal';

const AHORA = new Date('2026-10-20T12:00:00Z');
const ORIGEN = 'https://citas.example.test';
const RUTA = '/publico/negocios/portal-prueba-1/sesion';

describe('M3-T025–T030: entrada pública y contexto sin usuario', () => {
  it('autoriza slug y licencia, crea una sola sesión anónima y protege origen y datos', async () => {
    await conBaseMigrada(async (db) => {
      const reloj = new RelojPrueba(AHORA);
      const { negocios: [a, b] } = await crearEscenarioPortal(db, reloj);
      await db.query(`INSERT INTO licencias (negocio_id,creado_en,habilitada_en,vence_en)
        VALUES (?,'2026-01-01','2026-01-01','2027-01-01')`, [a.id]);
      const original = { origen: process.env.PORTAL_PUBLICO_ORIGEN,
        secreto: process.env.PORTAL_CSRF_SECRET };
      process.env.PORTAL_PUBLICO_ORIGEN = ORIGEN;
      process.env.PORTAL_CSRF_SECRET = 'secreto-de-pruebas-del-portal-de-32-caracteres';
      const modulo = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(DataSource).useValue(db)
        .overrideProvider(RELOJ).useValue(reloj).compile();
      const app: INestApplication = modulo.createNestApplication();
      try {
        await app.init();
        const http = app.getHttpServer();
        const iniciar = (ruta = RUTA) => request(http).post(ruta)
          .set('Origin', ORIGEN).set('X-Portal-Inicializacion', '1');
        await iniciar('/publico/negocios/inexistente/sesion').expect(404);
        await iniciar('/publico/negocios/portal-prueba-2/sesion').expect(404);
        await request(http).post(RUTA).set('Origin', 'https://ajeno.example.test')
          .set('X-Portal-Inicializacion', '1').expect(403);
        await request(http).post(RUTA).set('Origin', ORIGEN).expect(403);
        await iniciar().send({ negocioId: b.id, telefono: '6141234567' }).expect(400);

        const primera = await iniciar().expect(201);
        expect(primera.headers['cache-control']).toBe('no-store');
        expect(primera.headers['set-cookie'][0]).toMatch(/HttpOnly;.*SameSite=Strict/);
        // Secure se activa al servir en producción; Supertest usa HTTP local.
        expect(primera.headers['set-cookie'][0]).not.toMatch(/; Secure/);
        expect(primera.body).toEqual({ negocio: { slug: 'portal-prueba-1', nombre: 'Portal 1' },
          csrfToken: expect.any(String) });
        const cookie = primera.headers['set-cookie'][0].split(';')[0];
        const repetida = await iniciar().set('Cookie', cookie).expect(200);
        expect(repetida.body).toEqual(primera.body);
        await db.query(`INSERT INTO licencias (negocio_id,creado_en,habilitada_en,vence_en)
          VALUES (?,'2026-01-01','2026-01-01','2027-01-01')`, [b.id]);
        await iniciar('/publico/negocios/portal-prueba-2/sesion')
          .set('Cookie', cookie).expect(401);
        expect((await db.query('SELECT COUNT(*) total FROM sesiones_reserva_publica'))[0].total)
          .toBe('1');
        const [guardada] = await db.query('SELECT titular_hash FROM sesiones_reserva_publica');
        expect(guardada.titular_hash).toMatch(/^[a-f0-9]{64}$/);
        expect(guardada.titular_hash).not.toContain(cookie.split('=')[1]);
        await iniciar().set('Cookie', 'reserva_sesion=alterada').expect(401);
        expect(JSON.stringify(primera.body)).not.toMatch(/rfc|correo|telefono|cliente|titular_hash/i);
        // Un error técnico nunca devuelve la consulta ni la credencial.
        const resolutor = app.get(ResolverNegocioPublicoService);
        const fallo = jest.spyOn(resolutor, 'resolver')
          .mockRejectedValueOnce(new Error('SQL secreto: telefono_contacto=6141234567'));
        const error = await iniciar().set('Cookie', cookie).expect(500);
        expect(error.headers['cache-control']).toBe('no-store');
        expect(JSON.stringify(error.body)).not.toMatch(/SQL|6141234567|reserva_sesion/i);
        fallo.mockRestore();
        await db.query('UPDATE negocios SET activado_en=NULL WHERE id=?', [a.id]);
        await iniciar().set('Cookie', cookie).expect(404);
        await db.query('UPDATE negocios SET activado_en=creado_en WHERE id=?', [a.id]);

        // La política se relee: el mismo navegador deja de poder iniciar al vencer.
        reloj.fijar(new Date('2027-01-01T00:00:00Z'));
        await iniciar().set('Cookie', cookie).expect(404);
      } finally {
        await app.close();
        process.env.PORTAL_PUBLICO_ORIGEN = original.origen;
        process.env.PORTAL_CSRF_SECRET = original.secreto;
      }
    });
  }, 60000);

  it('forma un contexto de cálculo público con manager, instante, negocio y Profesional', async () => {
    await conBaseMigrada(async (db) => {
      const reloj = new RelojPrueba(AHORA);
      const { negocios: [a, b] } = await crearEscenarioPortal(db, reloj);
      await db.query(`INSERT INTO licencias (negocio_id,creado_en,habilitada_en,vence_en)
        VALUES (?,'2026-01-01','2026-01-01','2027-01-01')`, [a.id]);
      const modulo = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(DataSource).useValue(db)
        .overrideProvider(RELOJ).useValue(reloj).compile();
      try {
        const contextos = modulo.get(ContextoDisponibilidadService);
        await db.transaction('REPEATABLE READ', async (manager) => {
          const contexto = await contextos.resolverPublico(manager, a.id,
            a.profesionales[0], AHORA);
          expect(contexto).toMatchObject({ manager, negocioId: a.id,
            personalId: a.profesionales[0], ahora: AHORA });
          expect(contexto).not.toHaveProperty('actorId');
          expect(contexto).not.toHaveProperty('rol');
          await expect(contextos.resolverPublico(manager, a.id,
            b.profesionales[0], AHORA)).rejects.toMatchObject({ status: 404 });
        });
      } finally { await modulo.close(); }
    });
  }, 60000);
});
