import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { Rol } from '../src/auth/enums/rol.enum';
import { SesionesService } from '../src/auth/services/sesiones.service';
import { RELOJ } from '../src/comun/reloj';
import { Licencia } from '../src/licencias/entities/licencia.entity';
import { Negocio } from '../src/negocios/entities/negocio.entity';
import { Usuario } from '../src/usuarios/entities/usuario.entity';
import { conBaseMigrada } from './support/mariadb';
import { RelojPrueba } from './support/reloj';

describe('ALA-T057: contratos HTTP de cupos', () => {
  it('separa modificación global y consultas propias por rol y negocio', async () => {
    await conBaseMigrada(async (db) => {
      const ahora = new Date(Date.now() + 60_000);
      const reloj = new RelojPrueba(ahora);
      const modulo = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(DataSource).useValue(db)
        .overrideProvider(RELOJ).useValue(reloj).compile();
      const app: INestApplication = modulo.createNestApplication();
      app.useGlobalPipes(new ValidationPipe({ whitelist: true,
        forbidNonWhitelisted: true, transform: true }));
      try {
        await app.init();
        const negocios: Negocio[] = [];
        for (let i = 0; i < 2; i++) {
          const negocio = await db.getRepository(Negocio).save({ nombre: `Cupos HTTP ${i}`,
            slug: `ala-cupo-${randomUUID()}`, emailContacto: `${randomUUID()}@example.test`,
            activadoEn: ahora });
          await db.getRepository(Licencia).save({ negocioId: negocio.id,
            habilitadaEn: ahora, venceEn: new Date(ahora.getTime() + 90 * 86_400_000),
            suspendidaEn: null });
          negocios.push(negocio);
        }
        const token = async (rol: Rol, negocioId: number | null) => {
          const usuario = await db.getRepository(Usuario).save({ negocioId,
            nombre: `${rol} ${randomUUID()}`, email: `${randomUUID()}@example.test`,
            passwordHash: 'hash', rol, activo: true, creadoEn: ahora, activadoEn: ahora });
          const sesion = await app.get(SesionesService).crear(usuario.id, ahora);
          return app.get(JwtService).sign({ sub: usuario.id, sesionId: sesion.id,
            rol, negocioId, email: usuario.email, nombre: usuario.nombre });
        };
        const superToken = await token(Rol.SUPERADMIN, null);
        const adminA = await token(Rol.ADMIN_NEGOCIO, negocios[0].id);
        const adminB = await token(Rol.ADMIN_NEGOCIO, negocios[1].id);
        const profesional = await token(Rol.PROFESIONAL, negocios[0].id);
        const base = `/negocios/${negocios[0].id}`;
        const servidor = app.getHttpServer();
        const antes = await request(servidor).get(`${base}/cupo-usuarios`)
          .auth(superToken, { type: 'bearer' }).expect(200);
        expect(antes.body).toMatchObject({ profesionales: { limite: 5, activos: 1 },
          recepcionistas: { limite: 3, activos: 0 } });
        await request(servidor).patch(`${base}/limites-usuarios`)
          .auth(adminA, { type: 'bearer' }).send({ limiteProfesionalesActivos: 2,
            limiteRecepcionistasActivos: 1 }).expect(403);
        await request(servidor).get(`${base}/cupo-usuarios`)
          .auth(adminB, { type: 'bearer' }).expect(403);
        await request(servidor).get('/profesionales/cupo')
          .auth(profesional, { type: 'bearer' }).expect(403);
        // El DTO rechaza tanto campos extra como límites incompletos o no enteros.
        for (const cuerpo of [{ limiteProfesionalesActivos: 0, limiteRecepcionistasActivos: 1 },
          { limiteProfesionalesActivos: 2 },
          { limiteProfesionalesActivos: 2, limiteRecepcionistasActivos: 1, negocioId: negocios[1].id }]) {
          await request(servidor).patch(`${base}/limites-usuarios`)
            .auth(superToken, { type: 'bearer' }).send(cuerpo).expect(400);
        }
        await request(servidor).patch(`${base}/limites-usuarios`)
          .auth(superToken, { type: 'bearer' }).send({ limiteProfesionalesActivos: 2,
            limiteRecepcionistasActivos: 1 }).expect(200);
        expect((await request(servidor).get('/profesionales/cupo')
          .auth(adminA, { type: 'bearer' }).expect(200)).body)
          .toMatchObject({ limite: 2, activos: 1, disponibles: 1 });
        expect((await request(servidor).get('/recepcionistas/cupo')
          .auth(adminA, { type: 'bearer' }).expect(200)).body)
          .toMatchObject({ limite: 1, activos: 0, disponibles: 1 });
        expect((await request(servidor).get('/profesionales/cupo')
          .auth(adminB, { type: 'bearer' }).expect(200)).body.limite).toBe(5);
        await token(Rol.PROFESIONAL, negocios[0].id);
        await request(servidor).patch(`${base}/limites-usuarios`)
          .auth(superToken, { type: 'bearer' }).send({ limiteProfesionalesActivos: 1,
            limiteRecepcionistasActivos: 1 }).expect(409);
        expect((await request(servidor).get('/profesionales/cupo')
          .auth(adminA, { type: 'bearer' }).expect(200)).body)
          .toMatchObject({ limite: 2, activos: 2, disponibles: 0 });
      } finally { await app.close(); }
    });
  });
});
