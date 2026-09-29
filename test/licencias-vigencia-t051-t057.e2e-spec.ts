import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { RELOJ } from '../src/comun/reloj';
import { Rol } from '../src/auth/enums/rol.enum';
import { Licencia } from '../src/licencias/entities/licencia.entity';
import { Negocio } from '../src/negocios/entities/negocio.entity';
import { Usuario } from '../src/usuarios/entities/usuario.entity';
import { PoliticaContrasenasService } from '../src/auth/services/politica-contrasenas.service';
import { conBaseMigrada } from './support/mariadb';
import { RelojPrueba } from './support/reloj';

const PASSWORD = 'clave-segura-t051-t057';
const INICIO = new Date('2028-01-10T12:00:00.000Z');

async function escenario(ejecutar: (ctx: {
  app: INestApplication; db: DataSource; reloj: RelojPrueba;
  superadmin: Usuario; administrador: Usuario; licencia: Licencia;
}) => Promise<void>, horasVence = 49) {
  await conBaseMigrada(async (db) => {
    const reloj = new RelojPrueba(INICIO);
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DataSource).useValue(db).overrideProvider(RELOJ).useValue(reloj).compile();
    const app = modulo.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    try {
      await app.init();
      const superadmin = await db.getRepository(Usuario).save({ negocioId: null,
        nombre: 'Super T051', email: 'super-t051@example.test',
        passwordHash: await new PoliticaContrasenasService().generarHash(PASSWORD),
        rol: Rol.SUPERADMIN, activo: true, activadoEn: reloj.ahora() });
      const negocio = await db.getRepository(Negocio).save({ nombre: 'Negocio T051', slug: 'negocio-t051',
        emailContacto: 'contacto-t051@example.test', telefonoContacto: null, activadoEn: reloj.ahora() });
      const licencia = await db.getRepository(Licencia).save({ negocioId: negocio.id,
        habilitadaEn: reloj.ahora(), venceEn: new Date(reloj.ahora().getTime() + horasVence * 60 * 60 * 1000),
        suspendidaEn: null });
      const administrador = await db.getRepository(Usuario).save({ negocioId: negocio.id,
        nombre: 'Admin T051', email: 'admin-t051@example.test',
        passwordHash: await new PoliticaContrasenasService().generarHash(PASSWORD),
        rol: Rol.ADMIN_NEGOCIO, activo: true, activadoEn: reloj.ahora() });
      await ejecutar({ app, db, reloj, superadmin, administrador, licencia });
    } finally { await app.close(); }
  });
}

async function login(app: INestApplication, email: string) {
  return (await request(app.getHttpServer()).post('/auth/login')
    .send({ email, password: PASSWORD }).expect(200)).body.accessToken as string;
}

describe('Licencias T051–T057 — renovación, vista y frontera HTTP', () => {
  it('informa la gracia y aplica el bloqueo exacto en solicitudes con sesión vigente', async () => {
    await escenario(async ({ app, db, reloj, superadmin, administrador, licencia }) => {
      const adminInicial = await login(app, administrador.email);
      const superInicial = await login(app, superadmin.email);
      const solicitud = await request(app.getHttpServer()).post(`/licencias/${licencia.id}/suspender`)
        .auth(superInicial, { type: 'bearer' }).send({}).expect(200);
      expect(solicitud.body).toMatchObject({ estado: 'suspension_pendiente', condicionAcceso: true,
        bloqueoProgramadoEn: new Date(INICIO.getTime() + 48 * 60 * 60 * 1000).toISOString() });
      await request(app.getHttpServer()).get('/licencias/mi-vigencia')
        .auth(adminInicial, { type: 'bearer' }).expect(200);

      reloj.avanzar(48 * 60 * 60 * 1000 - 60_000);
      const adminAntes = await login(app, administrador.email);
      await request(app.getHttpServer()).get('/auth/profile')
        .auth(adminAntes, { type: 'bearer' }).expect(200);
      await request(app.getHttpServer()).get('/licencias/mi-vigencia')
        .auth(adminAntes, { type: 'bearer' }).expect(200)
        .then(({ body }) => expect(body).toMatchObject({ estado: 'suspension_pendiente',
          tiempoRestante: { dias: 0, horas: 0, minutos: 1 } }));

      reloj.avanzar(60_000);
      await request(app.getHttpServer()).get('/auth/profile')
        .auth(adminAntes, { type: 'bearer' }).expect(401);
      const superAlLimite = await login(app, superadmin.email);
      const congelada = await request(app.getHttpServer()).get(`/licencias/${licencia.id}/vigencia`)
        .auth(superAlLimite, { type: 'bearer' }).expect(200);
      expect(congelada.body).toMatchObject({ estado: 'suspendida', condicionAcceso: false,
        tiempoCongelado: true, venceEn: null,
        tiempoRestante: { dias: 0, horas: 1, minutos: 0 } });
      expect(await db.getRepository(Usuario).findOneByOrFail({ id: administrador.id }))
        .toMatchObject({ activo: true, negocioId: administrador.negocioId });
    });
  });

  it('niega el acceso en un vencimiento natural anterior al bloqueo programado', async () => {
    await escenario(async ({ app, reloj, superadmin, administrador, licencia }) => {
      const superToken = await login(app, superadmin.email);
      const adminToken = await login(app, administrador.email);
      await request(app.getHttpServer()).post(`/licencias/${licencia.id}/suspender`)
        .auth(superToken, { type: 'bearer' }).send({}).expect(200);
      reloj.avanzar(60 * 60 * 1000);
      await request(app.getHttpServer()).get('/auth/profile')
        .auth(adminToken, { type: 'bearer' }).expect(401);
      const superDespues = await login(app, superadmin.email);
      await request(app.getHttpServer()).get(`/licencias/${licencia.id}/vigencia`)
        .auth(superDespues, { type: 'bearer' }).expect(200)
        .then(({ body }) => expect(body).toMatchObject({ estado: 'vencida', condicionAcceso: false,
          tiempoCongelado: false, tiempoRestante: { dias: 0, horas: 0, minutos: 0 } }));
    }, 1);
  });
});
