import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { Rol } from '../src/auth/enums/rol.enum';
import { SesionesService } from '../src/auth/services/sesiones.service';
import { EventoAuditoria } from '../src/auditoria/entities/evento-auditoria.entity';
import { RELOJ } from '../src/comun/reloj';
import { Licencia } from '../src/licencias/entities/licencia.entity';
import { OperacionLicencia } from '../src/licencias/entities/operacion-licencia.entity';
import { Negocio } from '../src/negocios/entities/negocio.entity';
import { Usuario } from '../src/usuarios/entities/usuario.entity';
import { conBaseMigrada } from './support/mariadb';
import { RelojPrueba } from './support/reloj';

type Contexto = { app: INestApplication; db: DataSource; licencia: Licencia;
  reloj: RelojPrueba; superToken: string; adminToken: string };
const clave = (nombre: string) => `ala-t035-${nombre}-1234567890123456`;

async function conHttp(ejecutar: (ctx: Contexto) => Promise<void>) {
  // Cada caso instala una base temporal y usa Guards, sesiones y reloj de la app real.
  await conBaseMigrada(async (db) => {
    const reloj = new RelojPrueba(new Date(Date.now() + 60_000));
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DataSource).useValue(db).overrideProvider(RELOJ).useValue(reloj).compile();
    const app = modulo.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true,
      forbidNonWhitelisted: true, transform: true }));
    try {
      await app.init();
      const negocio = await db.getRepository(Negocio).save({ nombre: 'ALA HTTP',
        slug: `ala-${randomUUID()}`, emailContacto: `${randomUUID()}@example.test`,
        telefonoContacto: null, activadoEn: reloj.ahora() });
      const licencia = await db.getRepository(Licencia).save({ negocioId: negocio.id,
        habilitadaEn: reloj.ahora(),
        venceEn: new Date(reloj.ahora().getTime() + 90 * 86_400_000), suspendidaEn: null });
      const tokens: string[] = [];
      for (const rol of [Rol.SUPERADMIN, Rol.ADMIN_NEGOCIO]) {
        const usuario = await db.getRepository(Usuario).save({
          negocioId: rol === Rol.SUPERADMIN ? null : negocio.id,
          rol, nombre: rol, email: `${randomUUID()}@example.test`,
          passwordHash: 'hash-de-prueba', activo: true, activadoEn: reloj.ahora(),
        });
        const sesion = await app.get(SesionesService).crear(usuario.id, reloj.ahora());
        tokens.push(app.get(JwtService).sign({ sub: usuario.id, sesionId: sesion.id,
          rol, negocioId: usuario.negocioId, email: usuario.email, nombre: usuario.nombre }));
      }
      await ejecutar({ app, db, licencia, reloj, superToken: tokens[0], adminToken: tokens[1] });
    } finally { await app.close(); }
  });
}

const operar = (ctx: Contexto, accion: 'suspender' | 'reactivar' | 'renovar',
  llave?: string, cuerpo: object = {}, token = ctx.superToken) => {
  const peticion = request(ctx.app.getHttpServer())
    .post(`/licencias/${ctx.licencia.id}/${accion}`).auth(token, { type: 'bearer' });
  if (llave !== undefined) peticion.set('Idempotency-Key', llave);
  return peticion.send(cuerpo);
};

describe('ALA-T035: HTTP idempotente de licencias', () => {
  it('exige superadmin y clave válida en los tres endpoints sin mutar', async () => {
    await conHttp(async (ctx) => {
      for (const accion of ['suspender', 'reactivar', 'renovar'] as const) {
        await operar(ctx, accion).expect(400);
        await operar(ctx, accion, 'corta').expect(400);
        await operar(ctx, accion, clave(accion), {}, ctx.adminToken).expect(403);
      }
      expect(await ctx.db.getRepository(OperacionLicencia).count()).toBe(0);
      expect(await ctx.db.getRepository(EventoAuditoria).count()).toBe(0);
    });
  });

  it('acepta solo plazo previsto en suspender y cuerpo vacío en las otras rutas', async () => {
    await conHttp(async (ctx) => {
      await operar(ctx, 'suspender', clave('invalido'), { plazoDias: 1.5 }).expect(400);
      await operar(ctx, 'suspender', clave('desconocido'), { plazoDias: 2, negocioId: 4 }).expect(400);
      await operar(ctx, 'renovar', clave('renovar-extra'), { anios: 2 }).expect(400);
      await operar(ctx, 'reactivar', clave('reactivar-extra'), { ahora: '2026-01-01' }).expect(400);
      const suspension = await operar(ctx, 'suspender', clave('suspender'), { plazoDias: 0 }).expect(200);
      expect(suspension.body).toMatchObject({ estado: 'suspendida', condicionAcceso: false });
      expect((await ctx.db.getRepository(Licencia).findOneByOrFail({ id: ctx.licencia.id }))
        .plazoSuspensionDias).toBe(0);
      await operar(ctx, 'reactivar', clave('reactivar')).expect(200);
      await operar(ctx, 'renovar', clave('renovar')).expect(200);
      expect(await ctx.db.getRepository(OperacionLicencia).count()).toBe(3);
    });
  });

  it.each([undefined, 30])('acepta plazo %s y conserva el valor programado', async (plazoDias) => {
    await conHttp(async (ctx) => {
      const cuerpo = plazoDias === undefined ? {} : { plazoDias };
      await operar(ctx, 'suspender', clave(`plazo-${plazoDias}`), cuerpo).expect(200);
      const guardada = await ctx.db.getRepository(Licencia).findOneByOrFail({ id: ctx.licencia.id });
      const efectivo = plazoDias ?? 2;
      expect(guardada.plazoSuspensionDias).toBe(efectivo);
      expect(guardada.bloqueoProgramadoEn).toEqual(
        new Date(ctx.reloj.ahora().getTime() + efectivo * 86_400_000));
    });
  });

  it('reproduce cuerpo histórico y evita una segunda transición o auditoría', async () => {
    // Se repite después de avanzar el reloj y después de otra transición.
    await conHttp(async (ctx) => {
      const primera = await operar(ctx, 'renovar', clave('repetir')).expect(200);
      const vencimiento = (await ctx.db.getRepository(Licencia).findOneByOrFail({ id: ctx.licencia.id })).venceEn;
      ctx.reloj.avanzar(60_000);
      const repetida = await operar(ctx, 'renovar', clave('repetir')).expect(200);
      expect(repetida.body).toEqual(primera.body);
      expect((await ctx.db.getRepository(Licencia).findOneByOrFail({ id: ctx.licencia.id })).venceEn)
        .toEqual(vencimiento);
      await operar(ctx, 'suspender', clave('repetir'), { plazoDias: 2 }).expect(409);
      const solicitud = await operar(ctx, 'suspender', clave('plazo'), { plazoDias: 2 }).expect(200);
      await operar(ctx, 'suspender', clave('plazo'), { plazoDias: 3 }).expect(409);
      expect((await operar(ctx, 'suspender', clave('plazo'), { plazoDias: 2 }).expect(200)).body)
        .toEqual(solicitud.body);
      expect((await operar(ctx, 'renovar', clave('repetir')).expect(200)).body)
        .toEqual(primera.body);
      expect(await ctx.db.getRepository(OperacionLicencia).count()).toBe(2);
      expect(await ctx.db.getRepository(EventoAuditoria).count()).toBe(2);
    });
  });

  it('repite reactivación sin desplazar vencimiento ni añadir auditoría', async () => {
    await conHttp(async (ctx) => {
      await operar(ctx, 'suspender', clave('susp-para-reactivar')).expect(200);
      const primera = await operar(ctx, 'reactivar', clave('reactivar-dos-veces')).expect(200);
      ctx.reloj.avanzar(60_000);
      const repetida = await operar(ctx, 'reactivar', clave('reactivar-dos-veces')).expect(200);
      expect(repetida.body).toEqual(primera.body);
      expect(await ctx.db.getRepository(OperacionLicencia).count()).toBe(2);
      expect(await ctx.db.getRepository(EventoAuditoria).count()).toBe(2);
    });
  });
});
