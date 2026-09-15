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
import { CodigoAcceso } from '../src/codigos/entities/codigo-acceso.entity';
import { EventoAuditoria } from '../src/auditoria/entities/evento-auditoria.entity';
import { AuditoriaService } from '../src/auditoria/auditoria.service';
import { AltasService, AltaNegocioCreada } from '../src/altas/altas.service';
import { SesionesService } from '../src/auth/services/sesiones.service';
import { Sesion } from '../src/auth/entities/sesion.entity';
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

const invitacion = { emailRecepcionista: ' NUEVA@EXAMPLE.TEST ' };
const reemitir = (ctx: Contexto, token = ctx.tokens[0], body: object = {}) => request(ctx.app.getHttpServer())
  .post(`/negocios/${ctx.pendiente.negocioId}/reemitir-codigo`).auth(token, { type: 'bearer' }).send(body);
function publicos(usuario: Usuario) {
  return { id: usuario.id, negocioId: usuario.negocioId, nombre: usuario.nombre, email: usuario.email,
    rol: usuario.rol, activo: usuario.activo, activadoEn: usuario.activadoEn?.toISOString() ?? null };
}
async function estado(db: DataSource) {
  return { usuarios: await db.getRepository(Usuario).find({ order: { id: 'ASC' } }),
    negocios: await db.getRepository(Negocio).find({ order: { id: 'ASC' } }),
    licencias: await db.getRepository(Licencia).find({ order: { id: 'ASC' } }),
    codigos: await db.getRepository(CodigoAcceso).find({ order: { id: 'ASC' } }),
    auditoria: await db.getRepository(EventoAuditoria).find({ order: { id: 'ASC' } }) };
}
async function rechazarRecepcion(ctx: Contexto, token: string | undefined, status: number) {
  // Se construye cada petición al ejecutarla para no reutilizar un puerto cerrado de Supertest.
  const rutas = [() => request(ctx.app.getHttpServer()).get('/recepcionistas'),
    () => request(ctx.app.getHttpServer()).get(`/recepcionistas/${ctx.usuarios[2].id}`),
    // T83 exige los mismos Guards para crear y restablecer cuentas.
    () => request(ctx.app.getHttpServer()).post('/recepcionistas').send({
      emailRecepcionista: 'guard@example.test', nombre: 'Guard', password: 'password-segura-t83',
    }),
    () => request(ctx.app.getHttpServer()).post(`/recepcionistas/${ctx.usuarios[2].id}/restablecer-contrasena`)
      .send({ nuevaPassword: 'password-nueva-t83' }),
    () => request(ctx.app.getHttpServer()).post(`/recepcionistas/${ctx.usuarios[2].id}/desactivar`).send({}),
    // T77 comparte los Guards y debe rechazar exactamente los mismos actores bloqueados.
    () => request(ctx.app.getHttpServer()).post(`/recepcionistas/${ctx.usuarios[2].id}/reactivar`).send({})];
  const antes = await estado(ctx.db);
  for (const preparar of rutas) {
    const peticion = preparar();
    if (token) peticion.auth(token, { type: 'bearer' });
    await peticion.expect(status);
  }
  expect(await estado(ctx.db)).toEqual(antes);
}

describe('T48, T77 y T83 — recepcionistas y reemisión HTTP', () => {
  it('rechaza la antigua invitación incompleta y conserva lista y consulta sin hashes ni códigos', async () => {
    await conHttp(async (ctx) => {
      const { app, db, tokens, usuarios } = ctx;
      const antes = await estado(db);
      await request(app.getHttpServer()).post('/recepcionistas').auth(tokens[1], { type: 'bearer' }).send(invitacion).expect(400);
      const lista = await request(app.getHttpServer()).get('/recepcionistas').auth(tokens[1], { type: 'bearer' }).expect(200);
      expect(lista.body).toEqual([publicos(usuarios[2])]);
      const detalle = await request(app.getHttpServer()).get(`/recepcionistas/${usuarios[2].id}`).auth(tokens[1], { type: 'bearer' }).expect(200);
      expect(detalle.body).toEqual(publicos(usuarios[2]));
      expect(await estado(db)).toEqual(antes);
    });
  });

  it('desactiva sin borrar y la siguiente solicitud del recepcionista es 401; repetir no cambia datos', async () => {
    await conHttp(async (ctx) => {
      const { app, db, tokens, usuarios } = ctx;
      const enviar = () => request(app.getHttpServer()).post(`/recepcionistas/${usuarios[2].id}/desactivar`).auth(tokens[1], { type: 'bearer' }).send({});
      await enviar().expect(204);
      expect(await db.getRepository(Usuario).findOneByOrFail({ id: usuarios[2].id })).toMatchObject({ activo: false, email: usuarios[2].email });
      await request(app.getHttpServer()).get('/auth/profile').auth(tokens[2], { type: 'bearer' }).expect(401);
      await request(app.getHttpServer()).get('/auth/profile').auth(tokens[4], { type: 'bearer' }).expect(200);
      const antes = await estado(db);
      await enviar().expect(204);
      expect(await estado(db)).toEqual(antes);
    });
  });

  it('T83 crea directamente una cuenta propia, activada y pública, sin códigos ni secretos', async () => {
    await conHttp(async ({ app, db, reloj, usuarios, tokens }) => {
      const codigosAntes = await db.getRepository(CodigoAcceso).count();
      const respuesta = await request(app.getHttpServer()).post('/recepcionistas')
        .auth(tokens[1], { type: 'bearer' }).send({
          emailRecepcionista: '  NUEVA@EXAMPLE.TEST  ',
          nombre: '  Nueva   Persona  ', password: 'password-segura-t83',
        }).expect(201);
      const creada = await db.getRepository(Usuario).findOneByOrFail({ id: respuesta.body.id });
      expect(creada).toMatchObject({ negocioId: usuarios[1].negocioId,
        nombre: 'Nueva Persona', email: 'nueva@example.test', rol: Rol.RECEPCIONISTA,
        activo: true, activadoEn: reloj.ahora() });
      await expect(new PoliticaContrasenasService().comparar('password-segura-t83', creada.passwordHash!))
        .resolves.toBe(true);
      expect(respuesta.body).toEqual(publicos(creada));
      expect(JSON.stringify(respuesta.body)).not.toMatch(/password|hash|codigo/i);
      expect(await db.getRepository(CodigoAcceso).count()).toBe(codigosAntes);
      const evento = await db.getRepository(EventoAuditoria).findOneByOrFail({
        accion: 'recepcionista_creado', usuarioId: creada.id,
      });
      expect(evento).toMatchObject({ actorUsuarioId: usuarios[1].id,
        negocioId: usuarios[1].negocioId });
      expect(JSON.stringify(evento)).not.toMatch(/password|hash|password-segura-t83/i);
      await request(app.getHttpServer()).post('/auth/activar-recepcionista')
        .send({ codigo: 'retirado', nombre: 'Recepción', password: 'password-segura-t83' })
        .expect(404);
    });
  });

  it('T83 restablece cuentas activas y desactivadas sin restaurarlas y revoca sus sesiones', async () => {
    await conHttp(async ({ app, db, reloj, usuarios, tokens, licencias }) => {
      await db.getRepository(Usuario).update(usuarios[4].id, { activo: false });
      for (const [actor, destino] of [[1, 2], [3, 4]]) {
        const usuarioAntes = await db.getRepository(Usuario).findOneByOrFail({ id: usuarios[destino].id });
        const licenciaAntes = await db.getRepository(Licencia).findOneByOrFail({ id: licencias[actor === 1 ? 0 : 1].id });
        const sesion = await db.getRepository(Sesion).findOneByOrFail({ usuarioId: usuarioAntes.id });
        const respuesta = await request(app.getHttpServer())
          .post(`/recepcionistas/${usuarioAntes.id}/restablecer-contrasena`)
          .auth(tokens[actor], { type: 'bearer' })
          .send({ nuevaPassword: 'password-nueva-t83' }).expect(204);
        expect(respuesta.text).toBe('');
        const despues = await db.getRepository(Usuario).findOneByOrFail({ id: usuarioAntes.id });
        expect(despues).toMatchObject({ id: usuarioAntes.id, negocioId: usuarioAntes.negocioId,
          nombre: usuarioAntes.nombre, email: usuarioAntes.email, rol: usuarioAntes.rol,
          activadoEn: usuarioAntes.activadoEn, activo: usuarioAntes.activo });
        expect(despues.passwordHash).not.toBe(usuarioAntes.passwordHash);
        await expect(new PoliticaContrasenasService().comparar('password-nueva-t83', despues.passwordHash!))
          .resolves.toBe(true);
        expect(await db.getRepository(Sesion).findOneByOrFail({ id: sesion.id }))
          .toMatchObject({ revocadaEn: reloj.ahora() });
        expect(await db.getRepository(Licencia).findOneByOrFail({ id: licenciaAntes.id }))
          .toMatchObject({ habilitadaEn: licenciaAntes.habilitadaEn,
            venceEn: licenciaAntes.venceEn, suspendidaEn: licenciaAntes.suspendidaEn });
        const evento = await db.getRepository(EventoAuditoria).findOneByOrFail({
          accion: 'recepcionista_contrasena_restablecida', usuarioId: usuarioAntes.id,
        });
        expect(evento).toMatchObject({ actorUsuarioId: usuarios[actor].id,
          negocioId: usuarioAntes.negocioId });
        expect(JSON.stringify(evento)).not.toMatch(/password|hash|password-nueva-t83/i);
      }
    });
  });

  it('T83 rechaza entradas inválidas, correo duplicado y restablecimiento ajeno sin mutaciones', async () => {
    await conHttp(async ({ app, db, usuarios, tokens }) => {
      const crear = (body: object) => request(app.getHttpServer()).post('/recepcionistas')
        .auth(tokens[1], { type: 'bearer' }).send(body);
      const reset = (id: string | number, body: object) => request(app.getHttpServer())
        .post(`/recepcionistas/${id}/restablecer-contrasena`)
        .auth(tokens[1], { type: 'bearer' }).send(body);
      const valido = { emailRecepcionista: 'nuevo@example.test', nombre: 'Nuevo',
        password: 'password-segura-t83' };
      const antes = await estado(db);
      for (const body of [invitacion, { ...valido, nombre: '   ' },
        { ...valido, emailRecepcionista: 'no-es-correo' },
        { ...valido, password: 'corta' }, { ...valido, password: 'á'.repeat(37) },
        { ...valido, negocioId: usuarios[3].negocioId },
        { ...valido, rol: Rol.ADMIN_NEGOCIO }, { ...valido, codigo: 'prohibido' },
        { ...valido, emailRecepcionista: usuarios[4].email }]) {
        await crear(body).expect(body.emailRecepcionista === usuarios[4].email ? 409 : 400);
      }
      for (const id of [usuarios[4].id, usuarios[1].id, 4294967295]) {
        await reset(id, { nuevaPassword: 'password-nueva-t83' }).expect(404);
      }
      for (const id of ['abc', '0', '-1', '1.2', '4294967296']) {
        await reset(id, { nuevaPassword: 'password-nueva-t83' }).expect(400);
      }
      for (const body of [{}, { nuevaPassword: 'corta' },
        { nuevaPassword: 'á'.repeat(37) }, { nuevaPassword: 42 },
        { nuevaPassword: 'password-nueva-t83', negocioId: usuarios[3].negocioId },
        { nuevaPassword: 'password-nueva-t83', codigo: 'prohibido' }]) {
        await reset(usuarios[2].id, body).expect(400);
      }
      expect(await estado(db)).toEqual(antes);
    });
  });

  it('T77 reactiva una cuenta propia sin restaurar sesiones ni modificar identidad o licencia', async () => {
    await conHttp(async ({ app, db, reloj, usuarios, tokens, licencias }) => {
      const id = usuarios[2].id;
      const ruta = `/recepcionistas/${id}`;
      const enviar = () => request(app.getHttpServer()).post(`${ruta}/reactivar`)
        .auth(tokens[1], { type: 'bearer' }).send({});
      const licenciaAntes = await db.getRepository(Licencia).findOneByOrFail({ id: licencias[0].id });
      const usuarioAntes = await db.getRepository(Usuario).findOneByOrFail({ id });
      const sesionAntes = await db.getRepository(Sesion).findOneByOrFail({ usuarioId: id });

      await request(app.getHttpServer()).post(`${ruta}/desactivar`)
        .auth(tokens[1], { type: 'bearer' }).send({}).expect(204);
      const revocada = await db.getRepository(Sesion).findOneByOrFail({ id: sesionAntes.id });
      expect(revocada.revocadaEn).toEqual(reloj.ahora());
      const respuesta = await enviar().expect(204);
      expect(respuesta.body).toEqual({});
      expect(await db.getRepository(Usuario).findOneByOrFail({ id })).toMatchObject({
        id, negocioId: usuarioAntes.negocioId, nombre: usuarioAntes.nombre,
        email: usuarioAntes.email, passwordHash: usuarioAntes.passwordHash,
        rol: usuarioAntes.rol, activadoEn: usuarioAntes.activadoEn, activo: true,
      });
      expect(await db.getRepository(Sesion).findOneByOrFail({ id: sesionAntes.id }))
        .toMatchObject({ revocadaEn: revocada.revocadaEn });
      expect(await db.getRepository(Licencia).findOneByOrFail({ id: licencias[0].id }))
        .toMatchObject({ habilitadaEn: licenciaAntes.habilitadaEn,
          venceEn: licenciaAntes.venceEn, suspendidaEn: licenciaAntes.suspendidaEn });
      await request(app.getHttpServer()).get('/auth/profile')
        .auth(tokens[2], { type: 'bearer' }).expect(401);
      expect(await db.getRepository(EventoAuditoria).countBy({ accion: 'recepcionista_reactivado' }))
        .toBe(1);
      const antesDeRepetir = await estado(db);
      await enviar().expect(204);
      expect(await estado(db)).toEqual(antesDeRepetir);
    });
  });

  it('devuelve 404 para recepción ajena, administradores e IDs inexistentes sin cambios', async () => {
    await conHttp(async ({ app, db, usuarios, tokens }) => {
      const antes = await estado(db);
      for (const id of [usuarios[4].id, usuarios[1].id, 4294967295]) {
        await request(app.getHttpServer()).get(`/recepcionistas/${id}`).auth(tokens[1], { type: 'bearer' }).expect(404);
        await request(app.getHttpServer()).post(`/recepcionistas/${id}/desactivar`).auth(tokens[1], { type: 'bearer' }).send({}).expect(404);
        await request(app.getHttpServer()).post(`/recepcionistas/${id}/reactivar`).auth(tokens[1], { type: 'bearer' }).send({}).expect(404);
      }
      expect(await estado(db)).toEqual(antes);
    });
  });

  it.each([0, 2])('deniega administración de recepción al usuario de fixture %s', async (indice) => {
    await conHttp((ctx) => rechazarRecepcion(ctx, ctx.tokens[indice], 403));
  });

  it.each(['ausente', 'revocada', 'vencida', 'suspendida'])('aplica 401 a recepción con sesión/cuenta %s', async (condicion) => {
    await conHttp(async (ctx) => {
      if (condicion === 'revocada') await ctx.app.get(SesionesService).revocarTodas(ctx.usuarios[1].id, ctx.reloj.ahora());
      if (condicion === 'vencida') ctx.reloj.avanzar(3600000);
      if (condicion === 'suspendida') await ctx.db.getRepository(Licencia).update(ctx.licencias[0].id, { suspendidaEn: ctx.reloj.ahora() });
      await rechazarRecepcion(ctx, condicion === 'ausente' ? undefined : ctx.tokens[1], 401);
    });
  });

  it('valida IDs y rechaza campos de identidad en desactivación y reemisión', async () => {
    await conHttp(async (ctx) => {
      const { app, db, tokens, usuarios } = ctx;
      const antes = await estado(db);
      for (const id of ['abc', '0', '-1', '1.2', '4294967296']) {
        await request(app.getHttpServer()).get(`/recepcionistas/${id}`).auth(tokens[1], { type: 'bearer' }).expect(400);
        await request(app.getHttpServer()).post(`/recepcionistas/${id}/desactivar`).auth(tokens[1], { type: 'bearer' }).send({}).expect(400);
        await request(app.getHttpServer()).post(`/recepcionistas/${id}/reactivar`).auth(tokens[1], { type: 'bearer' }).send({}).expect(400);
        await request(app.getHttpServer()).post(`/negocios/${id}/reemitir-codigo`).auth(tokens[0], { type: 'bearer' }).send({}).expect(400);
      }
      for (const campo of ['email', 'rol', 'negocioId', 'usuarioId', 'proposito', 'ahora']) {
        await reemitir(ctx, tokens[0], { [campo]: 'no' }).expect(400);
        await request(app.getHttpServer()).post(`/recepcionistas/${usuarios[2].id}/desactivar`).auth(tokens[1], { type: 'bearer' }).send({ [campo]: 'no' }).expect(400);
        await request(app.getHttpServer()).post(`/recepcionistas/${usuarios[2].id}/reactivar`).auth(tokens[1], { type: 'bearer' }).send({ [campo]: 'no' }).expect(400);
      }
      expect(await estado(db)).toEqual(antes);
    });
  });

  it.each([false, true])('reemite el código inicial sin cambiar destinatario ni licencia, suspendida=%s', async (suspendida) => {
    await conHttp(async (ctx) => {
      const { app, db, reloj, pendiente } = ctx;
      if (suspendida) await db.getRepository(Licencia).update(pendiente.licenciaId, { suspendidaEn: reloj.ahora() });
      const antes = await estado(db);
      reloj.avanzar(60000);
      const { body } = await reemitir(ctx).expect(201);
      expect(body).toEqual({ codigo: expect.any(String), expiraEn: new Date(reloj.ahora().getTime() + 48 * 3600000).toISOString() });
      expect(body.codigo).not.toBe(pendiente.codigo);
      const despues = await estado(db);
      expect(despues.usuarios).toEqual(antes.usuarios);
      expect(despues.negocios).toEqual(antes.negocios);
      expect(despues.licencias).toEqual(antes.licencias);
      const codigos = despues.codigos.filter((codigo) => codigo.usuarioId === pendiente.administradorId);
      expect(codigos).toHaveLength(2);
      expect(codigos[0].invalidadoEn).toEqual(reloj.ahora());
      expect(codigos[1]).toMatchObject({ usuarioId: pendiente.administradorId, negocioId: pendiente.negocioId,
        emisorUsuarioId: ctx.usuarios[0].id, consumidoEn: null, invalidadoEn: null });
      await request(app.getHttpServer()).post('/auth/activar-administrador')
        .send({ codigo: pendiente.codigo, nombre: 'Admin', password: 'password-nueva-t48' }).expect(400);
      expect(await estado(db)).toEqual(despues);
    });
  });

  it('protege reemisión por rol/sesión y rechaza negocio inexistente o ya activado', async () => {
    await conHttp(async (ctx) => {
      const antes = await estado(ctx.db);
      for (const token of [ctx.tokens[1], ctx.tokens[2], ctx.tokens[3]]) await reemitir(ctx, token).expect(403);
      await request(ctx.app.getHttpServer()).post(`/negocios/${ctx.pendiente.negocioId}/reemitir-codigo`).send({}).expect(401);
      await request(ctx.app.getHttpServer()).post('/negocios/4294967295/reemitir-codigo').auth(ctx.tokens[0], { type: 'bearer' }).send({}).expect(404);
      await request(ctx.app.getHttpServer()).post(`/negocios/${ctx.usuarios[1].negocioId}/reemitir-codigo`).auth(ctx.tokens[0], { type: 'bearer' }).send({}).expect(409);
      await ctx.app.get(SesionesService).revocarTodas(ctx.usuarios[0].id, ctx.reloj.ahora());
      await reemitir(ctx).expect(401);
      expect(await estado(ctx.db)).toEqual(antes);
    });
  });

  it('revierte reemplazo y auditoría juntos si falla registrar la emisión', async () => {
    await conHttp(async (ctx) => {
      const antes = await estado(ctx.db);
      // Inyección de fallo controlada: los Guards y la persistencia siguen siendo reales.
      const fallo = jest.spyOn(ctx.app.get(AuditoriaService), 'registrar').mockRejectedValueOnce(new Error('Fallo de prueba T48'));
      try { await reemitir(ctx).expect(500); } finally { fallo.mockRestore(); }
      expect(await estado(ctx.db)).toEqual(antes);
    });
  });
});
