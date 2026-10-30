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

const DIA = 86_400_000;

describe('ALA-T050: sesión abierta en los límites de licencia', () => {
  it.each(['bloqueo', 'vencimiento'] as const)(
    'permite antes y rechaza en y después del %s exacto', async (limite) => {
      await conBaseMigrada(async (db) => {
        const inicio = new Date(Date.now() + 60_000);
        const reloj = new RelojPrueba(inicio);
        const modulo = await Test.createTestingModule({ imports: [AppModule] })
          .overrideProvider(DataSource).useValue(db)
          .overrideProvider(RELOJ).useValue(reloj).compile();
        const app: INestApplication = modulo.createNestApplication();
        app.useGlobalPipes(new ValidationPipe({ whitelist: true,
          forbidNonWhitelisted: true, transform: true }));
        try {
          await app.init();
          const correo = `${randomUUID()}@example.test`;
          const negocio = await db.getRepository(Negocio).save({ nombre: 'Límite HTTP',
            slug: `ala-limite-${randomUUID()}`, emailContacto: correo,
            correoAdministrador: correo, telefonoContacto: null, activadoEn: inicio });
          const vence = new Date(inicio.getTime() + 3 * DIA);
          const bloqueo = new Date(inicio.getTime() + 2 * DIA);
          const licencia = await db.getRepository(Licencia).save({ negocioId: negocio.id,
            habilitadaEn: inicio, venceEn: limite === 'bloqueo' ? vence : bloqueo,
            suspendidaEn: null,
            suspensionSolicitadaEn: limite === 'bloqueo' ? inicio : null,
            bloqueoProgramadoEn: limite === 'bloqueo' ? bloqueo : null,
            plazoSuspensionDias: limite === 'bloqueo' ? 2 : null,
            versionSuspension: limite === 'bloqueo' ? 1 : 0 });
          const admin = await db.getRepository(Usuario).save({ negocioId: negocio.id,
            nombre: 'Administradora', email: correo, passwordHash: 'hash',
            rol: Rol.ADMIN_NEGOCIO, activo: true, activadoEn: inicio });
          // La sesión nace un segundo antes del límite para aislar la política de licencia
          // del vencimiento independiente de las sesiones de doce horas.
          const sesion = await app.get(SesionesService).crear(admin.id,
            new Date(bloqueo.getTime() - 1000));
          const token = app.get(JwtService).sign({ sub: admin.id, sesionId: sesion.id,
            rol: admin.rol, negocioId: negocio.id, email: admin.email, nombre: admin.nombre });
          const consultar = () => request(app.getHttpServer())
            .get('/licencias/mi-vigencia').auth(token, { type: 'bearer' });
          const instante = licencia.venceEn && limite === 'vencimiento'
            ? licencia.venceEn : bloqueo;
          // El mismo JWT y la misma sesión se reutilizan a ambos lados del límite.
          reloj.fijar(new Date(instante.getTime() - 1));
          await consultar().expect(200);
          reloj.fijar(instante);
          await consultar().expect(401);
          reloj.fijar(new Date(instante.getTime() + 1));
          await consultar().expect(401);
        } finally { await app.close(); }
      });
    });

  it('rechaza gestión de licencias para un administrador ajeno al superadmin', async () => {
    await conBaseMigrada(async (db) => {
      const inicio = new Date(Date.now() + 60_000);
      const reloj = new RelojPrueba(inicio);
      const modulo = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(DataSource).useValue(db)
        .overrideProvider(RELOJ).useValue(reloj).compile();
      const app = modulo.createNestApplication();
      app.useGlobalPipes(new ValidationPipe({ whitelist: true,
        forbidNonWhitelisted: true, transform: true }));
      try {
        await app.init();
        const correo = `${randomUUID()}@example.test`;
        const negocio = await db.getRepository(Negocio).save({ nombre: 'Rol HTTP',
          slug: `ala-rol-${randomUUID()}`, emailContacto: correo,
          telefonoContacto: null, activadoEn: inicio });
        const licencia = await db.getRepository(Licencia).save({ negocioId: negocio.id,
          habilitadaEn: inicio, venceEn: new Date(inicio.getTime() + DIA), suspendidaEn: null });
        const admin = await db.getRepository(Usuario).save({ negocioId: negocio.id,
          nombre: 'Administradora', email: correo, passwordHash: 'hash',
          rol: Rol.ADMIN_NEGOCIO, activo: true, activadoEn: inicio });
        const sesion = await app.get(SesionesService).crear(admin.id, inicio);
        const token = app.get(JwtService).sign({ sub: admin.id, sesionId: sesion.id,
          rol: admin.rol, negocioId: negocio.id, email: admin.email, nombre: admin.nombre });
        await request(app.getHttpServer()).post(`/licencias/${licencia.id}/renovar`)
          .auth(token, { type: 'bearer' }).set('Idempotency-Key',
            'ala-rol-ajeno-1234567890123456').send({}).expect(403);
        expect((await db.getRepository(Licencia).findOneByOrFail({ id: licencia.id })).venceEn)
          .toEqual(licencia.venceEn);
      } finally { await app.close(); }
    });
  });
});
