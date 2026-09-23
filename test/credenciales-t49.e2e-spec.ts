import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { RELOJ } from '../src/comun/reloj';
import { Usuario } from '../src/usuarios/entities/usuario.entity';
import { Sesion } from '../src/auth/entities/sesion.entity';
import { Negocio } from '../src/negocios/entities/negocio.entity';
import { Licencia } from '../src/licencias/entities/licencia.entity';
import { CodigoAcceso } from '../src/codigos/entities/codigo-acceso.entity';
import { EventoAuditoria } from '../src/auditoria/entities/evento-auditoria.entity';
import { AuditoriaService } from '../src/auditoria/auditoria.service';
import { AltasService, AltaNegocioCreada } from '../src/altas/altas.service';
import { SesionesService } from '../src/auth/services/sesiones.service';
import { PoliticaContrasenasService } from '../src/auth/services/politica-contrasenas.service';
import { Rol } from '../src/auth/enums/rol.enum';
import { conBaseMigrada } from './support/mariadb';
import { RelojPrueba } from './support/reloj';

type Contexto = { app: INestApplication; db: DataSource; reloj: RelojPrueba;
  usuarios: Usuario[]; tokens: string[]; licencias: Licencia[]; pendiente: AltaNegocioCreada };

// Usuarios 0=superadmin, 1/2=admin y recepción A, 3/4=admin y recepción B.
async function conHttp(ejecutar: (ctx: Contexto) => Promise<void>) {
  await conBaseMigrada(async (db) => {
    const reloj = new RelojPrueba(new Date(Date.now() + 60000));
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DataSource).useValue(db).overrideProvider(RELOJ).useValue(reloj).compile();
    const app = modulo.createNestApplication();
    // Se conservan los Guards reales y las opciones de ValidationPipe de producción.
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    try {
      await app.init();
      const hash = await new PoliticaContrasenasService().generarHash('password-segura-t48');
      const usuarios: Usuario[] = [];
      const licencias: Licencia[] = [];
      usuarios.push(await db.getRepository(Usuario).save({ negocioId: null, rol: Rol.SUPERADMIN,
        nombre: 'Superadmin', email: 'super@example.test', passwordHash: hash, activo: true, activadoEn: reloj.ahora() }));
      for (const letra of ['a', 'b']) {
        const negocio = await db.getRepository(Negocio).save({ nombre: letra, slug: letra,
          emailContacto: `${letra}@example.test`, telefonoContacto: null, activadoEn: reloj.ahora() });
        licencias.push(await db.getRepository(Licencia).save({ negocioId: negocio.id,
          habilitadaEn: reloj.ahora(), venceEn: new Date(reloj.ahora().getTime() + 86400000), suspendidaEn: null }));
        for (const rol of [Rol.ADMIN_NEGOCIO, Rol.RECEPCIONISTA]) {
          usuarios.push(await db.getRepository(Usuario).save({ negocioId: negocio.id, rol,
            nombre: `${rol}-${letra}`, email: `${rol}-${letra}@example.test`, passwordHash: hash,
            activo: true, activadoEn: reloj.ahora() }));
        }
      }
      // Las fixtures crean sesiones persistidas y JWT firmados, sin sustituir su validación.
      const tokens: string[] = [];
      for (const usuario of usuarios) {
        const sesion = await app.get(SesionesService).crear(usuario.id, reloj.ahora());
        tokens.push(app.get(JwtService).sign({ sub: usuario.id, sesionId: sesion.id,
          rol: usuario.rol, negocioId: usuario.negocioId, email: usuario.email, nombre: usuario.nombre }));
      }
      const pendiente = await app.get(AltasService).crearNegocio({ actorUsuarioId: usuarios[0].id,
        nombre: 'Pendiente', identificadorPublico: 'pendiente', emailAdministrador: 'pendiente@example.test', ahora: reloj.ahora() });
      await ejecutar({ app, db, reloj, usuarios, tokens, licencias, pendiente });
    } finally { await app.close(); }
  });
}


// La sesión fija el dueño del cambio; la recuperación solo admite administradores.
const cambio = { passwordActual: 'password-segura-t48', nuevaPassword: 'password-nueva-t49' };
const cambiar = (ctx: Contexto, token = ctx.tokens[1], body: object = cambio) =>
  request(ctx.app.getHttpServer()).post('/auth/cambiar-contrasena').auth(token, { type: 'bearer' }).send(body);
const autorizar = (ctx: Contexto, id: number | string = ctx.usuarios[1].id, token = ctx.tokens[0], body: object = {}) =>
  request(ctx.app.getHttpServer()).post(`/auth/administradores/${id}/autorizar-recuperacion`).auth(token, { type: 'bearer' }).send(body);
// Los rechazos comparan incluso hashes y sesiones para detectar efectos parciales.
async function estado(db: DataSource) {
  return {
    usuarios: await db.getRepository(Usuario).createQueryBuilder('u').addSelect('u.passwordHash').orderBy('u.id').getMany(),
    sesiones: await db.getRepository(Sesion).find({ order: { id: 'ASC' } }),
    codigos: await db.getRepository(CodigoAcceso).find({ order: { id: 'ASC' } }),
    licencias: await db.getRepository(Licencia).find({ order: { id: 'ASC' } }),
    auditoria: await db.getRepository(EventoAuditoria).find({ order: { id: 'ASC' } }),
  };
}

describe('T49 — cambio y autorización de recuperación HTTP', () => {
  it.each([0, 1, 2])('cambia la clave propia y revoca todas las sesiones del rol fixture %s', async (indice) => {
    await conHttp(async (ctx) => {
      const usuario = ctx.usuarios[indice];
      await ctx.app.get(SesionesService).crear(usuario.id, ctx.reloj.ahora());
      expect((await cambiar(ctx, ctx.tokens[indice]).expect(204)).text).toBe('');
      const sesiones = await ctx.db.getRepository(Sesion).findBy({ usuarioId: usuario.id });
      expect(sesiones.length).toBeGreaterThanOrEqual(2);
      expect(sesiones.every(s => s.revocadaEn !== null)).toBe(true);
      await request(ctx.app.getHttpServer()).get('/auth/profile').auth(ctx.tokens[indice], { type: 'bearer' }).expect(401);
      await request(ctx.app.getHttpServer()).get('/auth/profile').auth(ctx.tokens[3], { type: 'bearer' }).expect(200);
      await request(ctx.app.getHttpServer()).post('/auth/login').send({ email: usuario.email, password: cambio.passwordActual }).expect(401);
      await request(ctx.app.getHttpServer()).post('/auth/login').send({ email: usuario.email, password: cambio.nuevaPassword }).expect(200);
    });
  });

  it('rechaza claves inválidas y campos de identidad sin mutaciones', async () => {
    await conHttp(async (ctx) => {
      const antes = await estado(ctx.db);
      for (const body of [{}, { ...cambio, passwordActual: 'incorrecta' }, { ...cambio, passwordActual: 42 },
        { ...cambio, nuevaPassword: 42 }, { ...cambio, nuevaPassword: 'corta' }, { ...cambio, nuevaPassword: 'á'.repeat(37) },
        ...['usuarioId', 'negocioId', 'rol', 'ahora', 'actorUsuarioId'].map(campo => ({ ...cambio, [campo]: ctx.usuarios[3].id }))]) {
        await cambiar(ctx, ctx.tokens[1], body).expect(400);
      }
      expect(await estado(ctx.db)).toEqual(antes);
    });
  });

  it.each(['ausente', 'revocada', 'vencida', 'suspendida', 'licencia-vencida', 'inactiva'])('bloquea cambio con condición %s', async (condicion) => {
    await conHttp(async (ctx) => {
      if (condicion === 'revocada') await ctx.app.get(SesionesService).revocarTodas(ctx.usuarios[1].id, ctx.reloj.ahora());
      if (condicion === 'vencida') ctx.reloj.avanzar(12 * 60 * 60 * 1000);
      if (condicion === 'suspendida') await ctx.db.getRepository(Licencia).update(ctx.licencias[0].id, { suspendidaEn: ctx.reloj.ahora() });
      if (condicion === 'licencia-vencida') {
        // El vencimiento debe ser posterior a la habilitación, aun al probar su límite exacto.
        ctx.reloj.avanzar(1000);
        await ctx.db.getRepository(Licencia).update(ctx.licencias[0].id, { venceEn: ctx.reloj.ahora() });
      }
      if (condicion === 'inactiva') await ctx.db.getRepository(Usuario).update(ctx.usuarios[1].id, { activo: false });
      const antes = await estado(ctx.db);
      if (condicion === 'ausente') await request(ctx.app.getHttpServer()).post('/auth/cambiar-contrasena').send(cambio).expect(401);
      else await cambiar(ctx).expect(401);
      expect(await estado(ctx.db)).toEqual(antes);
    });
  });

  it('reemplaza códigos por 30 minutos; consumir revoca sesiones y conserva bloqueos', async () => {
    await conHttp(async (ctx) => {
      await ctx.db.getRepository(Usuario).update(ctx.usuarios[1].id, { activo: false });
      await ctx.db.getRepository(Licencia).update(ctx.licencias[0].id, { suspendidaEn: ctx.reloj.ahora() });
      const antes = await estado(ctx.db);
      const primero = await autorizar(ctx).expect(201);
      ctx.reloj.avanzar(1000);
      const segundo = await autorizar(ctx).expect(201);
      expect(segundo.body).toEqual({ codigo: expect.any(String), expiraEn: new Date(ctx.reloj.ahora().getTime() + 1800000).toISOString() });
      expect(segundo.body.codigo).not.toBe(primero.body.codigo);
      const emitido = await estado(ctx.db);
      expect(emitido.usuarios).toEqual(antes.usuarios);
      expect(emitido.licencias).toEqual(antes.licencias);
      expect(emitido.sesiones).toEqual(antes.sesiones);
      const eventos = emitido.auditoria.filter(e => e.accion === 'recuperacion_autorizada');
      expect(eventos).toHaveLength(2);
      expect(eventos[0]).toMatchObject({ actorUsuarioId: ctx.usuarios[0].id, usuarioId: ctx.usuarios[1].id, negocioId: ctx.usuarios[1].negocioId });
      const recuperar = (codigo: string) => request(ctx.app.getHttpServer()).post('/auth/recuperar-contrasena').send({ codigo, password: cambio.nuevaPassword });
      await recuperar(primero.body.codigo).expect(400);
      await recuperar(segundo.body.codigo).expect(204);
      await recuperar(segundo.body.codigo).expect(400);
      const despues = await estado(ctx.db);
      expect(despues.licencias).toEqual(antes.licencias);
      expect(despues.usuarios.find(u => u.id === ctx.usuarios[1].id)?.activo).toBe(false);
      expect(despues.sesiones.filter(s => s.usuarioId === ctx.usuarios[1].id).every(s => s.revocadaEn !== null)).toBe(true);
      await request(ctx.app.getHttpServer()).get('/auth/profile').auth(ctx.tokens[1], { type: 'bearer' }).expect(401);
    });
  });

  it('exige superadmin y sesión vigente; rechaza recepción, superadmin e inexistentes como destino', async () => {
    await conHttp(async (ctx) => {
      const antes = await estado(ctx.db);
      for (const token of [ctx.tokens[1], ctx.tokens[2], ctx.tokens[3]]) await autorizar(ctx, ctx.usuarios[1].id, token).expect(403);
      for (const id of [ctx.usuarios[0].id, ctx.usuarios[2].id, ctx.usuarios[4].id, 4294967295]) await autorizar(ctx, id).expect(404);
      await request(ctx.app.getHttpServer()).post(`/auth/administradores/${ctx.usuarios[1].id}/autorizar-recuperacion`).send({}).expect(401);
      expect(await estado(ctx.db)).toEqual(antes);
      await ctx.app.get(SesionesService).revocarTodas(ctx.usuarios[0].id, ctx.reloj.ahora());
      const revocado = await estado(ctx.db);
      await autorizar(ctx).expect(401);
      expect(await estado(ctx.db)).toEqual(revocado);
    });
  });

  it('valida IDs y cuerpo vacío sin permitir cambiar destinatario ni propósito', async () => {
    await conHttp(async (ctx) => {
      const antes = await estado(ctx.db);
      for (const id of ['abc', 0, -1, '1.2', '4294967296']) await autorizar(ctx, id).expect(400);
      for (const campo of ['usuarioId', 'administradorId', 'negocioId', 'rol', 'email', 'proposito', 'ahora']) {
        await autorizar(ctx, ctx.usuarios[1].id, ctx.tokens[0], { [campo]: 'no' }).expect(400);
      }
      expect(await estado(ctx.db)).toEqual(antes);
    });
  });

  it('revierte emisión y reemplazo cuando falla su auditoría', async () => {
    await conHttp(async (ctx) => {
      await autorizar(ctx).expect(201);
      const antes = await estado(ctx.db);
      // Solo se inyecta fallo del registrador; transacción y Guards siguen siendo reales.
      const fallo = jest.spyOn(ctx.app.get(AuditoriaService), 'registrar').mockRejectedValueOnce(new Error('Fallo de prueba T49'));
      try { await autorizar(ctx).expect(500); } finally { fallo.mockRestore(); }
      expect(await estado(ctx.db)).toEqual(antes);
    });
  });
});
