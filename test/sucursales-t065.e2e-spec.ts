import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { RELOJ } from '../src/comun/reloj';
import { RelojPrueba } from './support/reloj';
import { conBaseMigrada } from './support/mariadb';
import { Rol } from '../src/auth/enums/rol.enum';
import { Usuario } from '../src/usuarios/entities/usuario.entity';
import { Negocio } from '../src/negocios/entities/negocio.entity';
import { Licencia } from '../src/licencias/entities/licencia.entity';
import { SesionesService } from '../src/auth/services/sesiones.service';
import { Sucursal } from '../src/sucursales/entities/sucursal.entity';

const entrada = { nombre: 'Centro', direccion: 'Calle Uno 5', telefono: '6141234567',
  zonaHoraria: 'America/Chihuahua' };

type Contexto = { app: INestApplication; db: DataSource; tokens: string[]; negocios: Negocio[] };

async function conHttp(ejecutar: (ctx: Contexto) => Promise<void>) {
  await conBaseMigrada(async (db) => {
    const reloj = new RelojPrueba(new Date(Date.now() + 120000));
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DataSource).useValue(db).overrideProvider(RELOJ).useValue(reloj).compile();
    const app = modulo.createNestApplication();
    // Igual que main.ts: los campos ajenos al DTO se rechazan antes del servicio.
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    try {
      await app.init();
      const usuarios: Usuario[] = [];
      const negocios: Negocio[] = [];
      usuarios.push(await db.getRepository(Usuario).save({ negocioId: null, nombre: 'Super',
        email: 'super-http-sucursal@example.test', passwordHash: 'hash', rol: Rol.SUPERADMIN,
        activo: true, creadoEn: reloj.ahora(), activadoEn: reloj.ahora() }));
      for (const letra of ['a', 'b']) {
        const negocio = await db.getRepository(Negocio).save({ nombre: letra, slug: `http-suc-${letra}`,
          emailContacto: `${letra}@example.test`, activadoEn: reloj.ahora(), limiteSucursalesActivas: 1 });
        negocios.push(negocio);
        await db.getRepository(Licencia).save({ negocioId: negocio.id, habilitadaEn: reloj.ahora(),
          venceEn: new Date(reloj.ahora().getTime() + 365 * 86400000), suspendidaEn: null });
        for (const rol of [Rol.ADMIN_NEGOCIO, Rol.RECEPCIONISTA, Rol.PROFESIONAL]) {
          usuarios.push(await db.getRepository(Usuario).save({ negocioId: negocio.id, nombre: rol,
            email: `${rol}-${letra}@example.test`, passwordHash: 'hash', rol, activo: true,
            creadoEn: reloj.ahora(), activadoEn: reloj.ahora() }));
        }
      }
      const tokens: string[] = [];
      // Sesiones persistidas y JWT reales permiten probar Guards y pertenencia actuales.
      for (const usuario of usuarios) {
        const sesion = await app.get(SesionesService).crear(usuario.id, reloj.ahora());
        tokens.push(app.get(JwtService).sign({ sub: usuario.id, sesionId: sesion.id,
          rol: usuario.rol, negocioId: usuario.negocioId }));
      }
      await ejecutar({ app, db, tokens, negocios });
    } finally { await app.close(); }
  });
}

describe('M1-T065: HTTP de sucursales y cupo', () => {
  it('crea, consulta, edita y desactiva conservando pertenencia y cupo', async () => {
    await conHttp(async ({ app, db, tokens, negocios }) => {
      const http = app.getHttpServer();
      const creada = await request(http).post('/sucursales').auth(tokens[1], { type: 'bearer' })
        .send(entrada).expect(201);
      expect(creada.body).toMatchObject({ negocioId: negocios[0].id, nombre: 'Centro',
        activo: true, urlGoogleMaps: null, notasLlegada: null });
      expect((await request(http).get('/sucursales/cupo').auth(tokens[1], { type: 'bearer' })
        .expect(200)).body).toMatchObject({ sucursalesActivas: 1, disponibles: 0 });
      await request(http).post('/sucursales').auth(tokens[1], { type: 'bearer' })
        .send({ ...entrada, nombre: 'Segunda' }).expect(409);
      const id = creada.body.id;
      expect((await request(http).get(`/sucursales/${id}`).auth(tokens[1], { type: 'bearer' })
        .expect(200)).body.negocioId).toBe(negocios[0].id);
      const editada = await request(http).patch(`/sucursales/${id}`).auth(tokens[1], { type: 'bearer' })
        .send({ nombre: 'Centro nuevo', notasLlegada: 'Puerta azul' }).expect(200);
      expect(editada.body).toMatchObject({ nombre: 'Centro nuevo', notasLlegada: 'Puerta azul' });
      await request(http).post(`/sucursales/${id}/desactivar`).auth(tokens[1], { type: 'bearer' })
        .send({}).expect(204);
      await request(http).post(`/sucursales/${id}/reactivar`).auth(tokens[1], { type: 'bearer' })
        .send({}).expect(404);
      expect((await request(http).get('/sucursales').auth(tokens[1], { type: 'bearer' })
        .expect(200)).body).toHaveLength(1);
      expect((await request(http).get('/sucursales/cupo').auth(tokens[1], { type: 'bearer' })
        .expect(200)).body).toMatchObject({ sucursalesActivas: 0, disponibles: 1 });
      expect((await db.getRepository(Sucursal).findOneByOrFail({ id })).activo).toBe(false);
      await request(http).post('/sucursales').auth(tokens[1], { type: 'bearer' })
        .send({ ...entrada, nombre: 'Segunda' }).expect(201);
    });
  });

  it('aísla negocios y exige roles y sesión vigente', async () => {
    await conHttp(async ({ app, db, tokens, negocios }) => {
      const http = app.getHttpServer();
      const propia = await request(http).post('/sucursales').auth(tokens[1], { type: 'bearer' })
        .send(entrada).expect(201);
      for (const indice of [2, 3]) {
        await request(http).post('/sucursales').auth(tokens[indice], { type: 'bearer' })
          .send(entrada).expect(403);
      }
      await request(http).get(`/sucursales/${propia.body.id}`).auth(tokens[4], { type: 'bearer' }).expect(404);
      await request(http).patch(`/sucursales/${propia.body.id}`).auth(tokens[4], { type: 'bearer' })
        .send({ nombre: 'Ajena' }).expect(404);
      await request(http).post(`/sucursales/${propia.body.id}/desactivar`)
        .auth(tokens[4], { type: 'bearer' }).send({}).expect(404);
      expect((await request(http).get('/sucursales').auth(tokens[4], { type: 'bearer' })
        .expect(200)).body).toEqual([]);
      await request(http).post('/sucursales').send(entrada).expect(401);
      await request(http).patch(`/negocios/${negocios[0].id}/limite-sucursales`)
        .auth(tokens[1], { type: 'bearer' }).send({ limiteSucursales: 2 }).expect(403);
      expect((await db.getRepository(Sucursal).findOneByOrFail({ id: propia.body.id })).nombre).toBe('Centro');
    });
  });

  it('reserva el cambio de cupo al superadmin y valida DTO, límite y reducción', async () => {
    await conHttp(async ({ app, tokens, negocios }) => {
      const http = app.getHttpServer();
      const id = negocios[0].id;
      for (const valor of [0, -1, 1.5, '2']) {
        await request(http).patch(`/negocios/${id}/limite-sucursales`)
          .auth(tokens[0], { type: 'bearer' }).send({ limiteSucursales: valor }).expect(400);
      }
      await request(http).post('/sucursales').auth(tokens[1], { type: 'bearer' })
        .send({ ...entrada, negocioId: negocios[1].id }).expect(400);
      await request(http).post('/sucursales').auth(tokens[1], { type: 'bearer' })
        .send({ ...entrada, zonaHoraria: 'Mars/Phobos' }).expect(400);
      await request(http).post('/sucursales').auth(tokens[1], { type: 'bearer' })
        .send({ ...entrada, activo: false }).expect(400);
      const primera = await request(http).post('/sucursales').auth(tokens[1], { type: 'bearer' })
        .send(entrada).expect(201);
      await request(http).patch(`/sucursales/${primera.body.id}`).auth(tokens[1], { type: 'bearer' })
        .send({ nombre: null }).expect(400);
      await request(http).patch(`/sucursales/${primera.body.id}`).auth(tokens[1], { type: 'bearer' })
        .send({ activo: true }).expect(400);
      const cambiada = await request(http).patch(`/negocios/${id}/limite-sucursales`)
        .auth(tokens[0], { type: 'bearer' }).send({ limiteSucursales: 2 }).expect(200);
      expect(cambiada.body).toMatchObject({ limiteSucursalesActivas: 2, sucursalesActivas: 1, disponibles: 1 });
      await request(http).post('/sucursales').auth(tokens[1], { type: 'bearer' })
        .send({ ...entrada, nombre: 'Norte' }).expect(201);
      await request(http).patch(`/negocios/${id}/limite-sucursales`)
        .auth(tokens[0], { type: 'bearer' }).send({ limiteSucursales: 1 }).expect(409);
      await request(http).post(`/sucursales/${primera.body.id}/desactivar`)
        .auth(tokens[1], { type: 'bearer' }).send({}).expect(204);
      await request(http).patch(`/negocios/${id}/limite-sucursales`)
        .auth(tokens[0], { type: 'bearer' }).send({ limiteSucursales: 1 }).expect(200);
      await request(http).patch(`/negocios/${id}/limite-sucursales`)
        .auth(tokens[0], { type: 'bearer' }).send({ limiteSucursales: 1, negocioId: negocios[1].id }).expect(400);
      await request(http).get(`/negocios/${id}/cupo-sucursales`).auth(tokens[0], { type: 'bearer' })
        .expect(200);
    });
  });
});
