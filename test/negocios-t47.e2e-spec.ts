import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { RELOJ } from '../src/comun/reloj';
import { Usuario } from '../src/usuarios/entities/usuario.entity';
import { Negocio } from '../src/negocios/entities/negocio.entity';
import { Licencia } from '../src/licencias/entities/licencia.entity';
import { Sesion } from '../src/auth/entities/sesion.entity';
import { CodigoAcceso } from '../src/codigos/entities/codigo-acceso.entity';
import { EventoAuditoria } from '../src/auditoria/entities/evento-auditoria.entity';
import { Rol } from '../src/auth/enums/rol.enum';
import { PoliticaContrasenasService } from '../src/auth/services/politica-contrasenas.service';
import { conBaseMigrada } from './support/mariadb';
import { RelojPrueba } from './support/reloj';

const alta = { nombre: '  Clínica nueva  ', identificadorPublico: ' Clinica-Nueva ', emailAdministrador: ' NUEVO@EXAMPLE.TEST ' };
type Contexto = {
  app: INestApplication; db: DataSource; reloj: RelojPrueba; negocio: Negocio;
  licencia: Licencia; usuarios: Record<Rol, Usuario>; tokens: Record<Rol, string>;
};

// Cada caso usa AppModule, JWT y Guards reales sobre una base migrada exclusiva.
async function conHttp(ejecutar: (ctx: Contexto) => Promise<void>) {
  await conBaseMigrada(async (db) => {
    const reloj = new RelojPrueba(new Date(Date.now() + 60000));
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DataSource).useValue(db).overrideProvider(RELOJ).useValue(reloj).compile();
    const app = modulo.createNestApplication();
    // Son las mismas opciones de validación global que main.ts.
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    try {
      await app.init();
      const negocio = await db.getRepository(Negocio).save({
        nombre: 'Negocio existente', slug: 'existente', emailContacto: 'contacto@example.test',
        telefonoContacto: null, activadoEn: reloj.ahora(),
      });
      const licencia = await db.getRepository(Licencia).save({
        negocioId: negocio.id, habilitadaEn: reloj.ahora(), suspendidaEn: null,
        venceEn: new Date(reloj.ahora().getTime() + 86400000),
      });
      const password = 'password-segura-t47';
      const hash = await new PoliticaContrasenasService().generarHash(password);
      const usuarios = {} as Record<Rol, Usuario>;
      const tokens = {} as Record<Rol, string>;
      for (const rol of Object.values(Rol)) {
        usuarios[rol] = await db.getRepository(Usuario).save({
          negocioId: rol === Rol.SUPERADMIN ? null : negocio.id, nombre: rol,
          email: `${rol}@example.test`, rol, activo: true, activadoEn: reloj.ahora(), passwordHash: hash,
        });
        const login = await request(app.getHttpServer()).post('/auth/login')
          .send({ email: usuarios[rol].email, password }).expect(200);
        tokens[rol] = login.body.accessToken;
      }
      await ejecutar({ app, db, reloj, negocio, licencia, usuarios, tokens });
    } finally {
      await app.close();
    }
  });
}

function crear(app: INestApplication, token: string, body: object = alta) {
  return request(app.getHttpServer()).post('/negocios').auth(token, { type: 'bearer' }).send(body);
}

// La lista explícita de campos detecta filtraciones de hash, sesiones o códigos.
function vista(negocio: Negocio, licencia: Licencia, admin: Usuario) {
  return {
    id: negocio.id, nombre: negocio.nombre, identificadorPublico: negocio.slug,
    emailContacto: negocio.emailContacto, telefonoContacto: negocio.telefonoContacto,
    activadoEn: negocio.activadoEn?.toISOString() ?? null, creadoEn: negocio.creadoEn.toISOString(),
    licencia: { id: licencia.id, habilitadaEn: licencia.habilitadaEn?.toISOString() ?? null,
      venceEn: licencia.venceEn?.toISOString() ?? null, suspendidaEn: licencia.suspendidaEn?.toISOString() ?? null },
    administrador: { id: admin.id, email: admin.email, activo: admin.activo,
      activadoEn: admin.activadoEn?.toISOString() ?? null },
  };
}

async function estado(db: DataSource) {
  return {
    negocios: await db.getRepository(Negocio).find({ order: { id: 'ASC' } }),
    usuarios: await db.getRepository(Usuario).find({ order: { id: 'ASC' } }),
    licencias: await db.getRepository(Licencia).find({ order: { id: 'ASC' } }),
    codigos: await db.getRepository(CodigoAcceso).find({ order: { id: 'ASC' } }),
    auditoria: await db.getRepository(EventoAuditoria).find({ order: { id: 'ASC' } }),
  };
}

// Las tres operaciones deben aplicar la misma autenticación y autorización actual.
async function rechazarRutas(ctx: Contexto, token: string | undefined, status: number) {
  // Supertest abre y cierra un puerto temporal por petición: no se deben
  // construir las siguientes hasta que la anterior haya terminado.
  const peticiones = [() => request(ctx.app.getHttpServer()).post('/negocios').send(alta),
    () => request(ctx.app.getHttpServer()).get('/negocios'),
    () => request(ctx.app.getHttpServer()).get(`/negocios/${ctx.negocio.id}`)];
  const antes = await estado(ctx.db);
  for (const preparar of peticiones) {
    const peticion = preparar();
    if (token) peticion.auth(token, { type: 'bearer' });
    await peticion.expect(status);
  }
  expect(await estado(ctx.db)).toEqual(antes);
}

describe('T47 — administración HTTP de negocios', () => {
  it('crea el alta anual pendiente y consulta globalmente sin volver a mostrar el código', async () => {
    await conHttp(async ({ app, db, reloj, tokens }) => {
      const token = tokens[Rol.SUPERADMIN];
      const { body } = await crear(app, token).expect(201);
      expect(body).toEqual({ negocioId: expect.any(Number), administradorId: expect.any(Number),
        licenciaId: expect.any(Number), codigo: expect.any(String),
        expiraEn: new Date(reloj.ahora().getTime() + 48 * 3600000).toISOString() });
      const negocio = await db.getRepository(Negocio).findOneByOrFail({ id: body.negocioId });
      const licencia = await db.getRepository(Licencia).findOneByOrFail({ id: body.licenciaId });
      const admin = await db.getRepository(Usuario).findOneByOrFail({ id: body.administradorId });
      expect(negocio).toMatchObject({ nombre: 'Clínica nueva', slug: 'clinica-nueva', activadoEn: null });
      expect(licencia).toMatchObject({ negocioId: negocio.id, habilitadaEn: null, venceEn: null, suspendidaEn: null });
      expect(admin).toMatchObject({ negocioId: negocio.id, email: 'nuevo@example.test',
        rol: Rol.ADMIN_NEGOCIO, nombre: null, passwordHash: null, activadoEn: null });
      const detalle = await request(app.getHttpServer()).get(`/negocios/${negocio.id}`).auth(token, { type: 'bearer' }).expect(200);
      expect(detalle.body).toEqual(vista(negocio, licencia, admin));
      const lista = await request(app.getHttpServer()).get('/negocios').auth(token, { type: 'bearer' }).expect(200);
      expect(lista.body).toHaveLength(2);
      expect(lista.body[1]).toEqual(detalle.body);
      expect(JSON.stringify(lista.body)).not.toContain(body.codigo);
      expect((await db.getRepository(CodigoAcceso).findOneByOrFail({ usuarioId: admin.id })).consumidoEn).toBeNull();
    });
  });

  it.each(['suspendida', 'vencida'])('superadmin consulta licencia %s y datos seguros del administrador', async (bloqueo) => {
    await conHttp(async ({ app, db, reloj, tokens, negocio, licencia, usuarios }) => {
      reloj.avanzar(1000);
      await db.getRepository(Licencia).update(licencia.id,
        bloqueo === 'suspendida' ? { suspendidaEn: reloj.ahora() } : { venceEn: reloj.ahora() });
      const actual = await db.getRepository(Licencia).findOneByOrFail({ id: licencia.id });
      const esperado = vista(negocio, actual, usuarios[Rol.ADMIN_NEGOCIO]);
      const antes = await estado(db);
      const lista = await request(app.getHttpServer()).get('/negocios').auth(tokens[Rol.SUPERADMIN], { type: 'bearer' }).expect(200);
      expect(lista.body).toEqual([esperado]);
      const detalle = await request(app.getHttpServer()).get(`/negocios/${negocio.id}`).auth(tokens[Rol.SUPERADMIN], { type: 'bearer' }).expect(200);
      expect(detalle.body).toEqual(esperado);
      expect(JSON.stringify(detalle.body)).not.toContain(usuarios[Rol.ADMIN_NEGOCIO].passwordHash);
      await request(app.getHttpServer()).get('/negocios').auth(tokens[Rol.ADMIN_NEGOCIO], { type: 'bearer' }).expect(401);
      expect(await estado(db)).toEqual(antes);
    });
  });

  it.each([Rol.ADMIN_NEGOCIO, Rol.RECEPCIONISTA])('deniega alta, lista y detalle al rol %s', async (rol) => {
    await conHttp((ctx) => rechazarRutas(ctx, ctx.tokens[rol], 403));
  });

  it('rechaza las tres operaciones sin autenticación', async () => {
    await conHttp((ctx) => rechazarRutas(ctx, undefined, 401));
  });

  it.each(['revocada', 'vencida'])('rechaza una sesión superadmin %s', async (condicion) => {
    await conHttp(async (ctx) => {
      const token = ctx.tokens[Rol.SUPERADMIN];
      if (condicion === 'revocada') {
        const payload = ctx.app.get(JwtService).verify(token);
        await ctx.db.getRepository(Sesion).update(payload.sesionId, { revocadaEn: ctx.reloj.ahora() });
      } else {
        ctx.reloj.avanzar(3600000);
      }
      await rechazarRutas(ctx, token, 401);
    });
  });

  it('usa el rol persistido aunque el token todavía declare superadmin', async () => {
    await conHttp(async (ctx) => {
      await ctx.db.getRepository(Usuario).update(ctx.usuarios[Rol.SUPERADMIN].id,
        { rol: Rol.RECEPCIONISTA, negocioId: ctx.negocio.id });
      await rechazarRutas(ctx, ctx.tokens[Rol.SUPERADMIN], 403);
    });
  });

  it('valida los tres campos de alta y rechaza modalidad, período e identidad enviada por el cliente', async () => {
    await conHttp(async ({ app, db, tokens }) => {
      const antes = await estado(db);
      const invalidos = [{}, ...['nombre', 'identificadorPublico', 'emailAdministrador'].flatMap((campo) =>
        [null, 123, '   '].map((valor) => ({ ...alta, [campo]: valor }))),
        { ...alta, nombre: 'a'.repeat(151) }, { ...alta, identificadorPublico: 'a'.repeat(101) },
        { ...alta, emailAdministrador: 'no-es-correo' }, { ...alta, emailAdministrador: `${'a'.repeat(145)}@example.test` }];
      for (const body of invalidos) await crear(app, tokens[Rol.SUPERADMIN], body).expect(400);
      for (const campo of ['modalidad', 'periodo', 'plan', 'rol', 'actorUsuarioId', 'negocioId', 'ahora']) {
        const respuesta = await crear(app, tokens[Rol.SUPERADMIN], { ...alta, [campo]: 'no-permitido' }).expect(400);
        expect(respuesta.body.message).toContain(`property ${campo} should not exist`);
      }
      expect(await estado(db)).toEqual(antes);
    });
  });

  it('responde 409 a slug o correo duplicados normalizados sin altas parciales ni auditoría extra', async () => {
    await conHttp(async ({ app, db, tokens }) => {
      const token = tokens[Rol.SUPERADMIN];
      await crear(app, token).expect(201);
      const antes = await estado(db);
      await crear(app, token, { ...alta, identificadorPublico: ' CLINICA-NUEVA ', emailAdministrador: 'distinto@example.test' }).expect(409);
      await crear(app, token, { ...alta, identificadorPublico: 'distinto', emailAdministrador: ' NUEVO@example.test ' }).expect(409);
      expect(await estado(db)).toEqual(antes);
    });
  });

  it('rechaza IDs inválidos y devuelve 404 para un negocio inexistente', async () => {
    await conHttp(async ({ app, db, tokens }) => {
      const antes = await estado(db);
      for (const id of ['abc', '0', '-1', '1.2', '4294967296']) {
        await request(app.getHttpServer()).get(`/negocios/${id}`).auth(tokens[Rol.SUPERADMIN], { type: 'bearer' }).expect(400);
      }
      await request(app.getHttpServer()).get('/negocios/4294967295').auth(tokens[Rol.SUPERADMIN], { type: 'bearer' }).expect(404);
      expect(await estado(db)).toEqual(antes);
    });
  });
});
