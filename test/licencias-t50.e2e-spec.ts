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
import { AltaNegocioHistorica as AltaNegocioCreada } from './support/altas-historicas';
import { servicios } from './support/escenarios-t51-t60';
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
      const hash = await new PoliticaContrasenasService().generarHash('password-segura-t50');
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
      // Estado histórico para licencias; no crea cuentas a través del alta de producción.
      const pendiente = await servicios(db).altas.crearNegocio({ actorUsuarioId: usuarios[0].id,
        nombre: 'Pendiente', identificadorPublico: 'pendiente', emailAdministrador: 'pendiente@example.test', ahora: reloj.ahora() });
      await ejecutar({ app, db, reloj, usuarios, tokens, licencias, pendiente });
    } finally { await app.close(); }
  });
}



// Cada petición se construye al ejecutarla; actor y hora nunca se envían en el cuerpo.
const acciones = ['suspender', 'reactivar', 'renovar'] as const;
type Accion = typeof acciones[number];
const operar = (ctx: Contexto, accion: Accion, id: number | string = ctx.licencias[0].id,
  token = ctx.tokens[0], body: object = {}) => request(ctx.app.getHttpServer())
  .post(`/licencias/${id}/${accion}`).auth(token, { type: 'bearer' }).send(body);
const perfil = (ctx: Contexto, indice: number) => request(ctx.app.getHttpServer())
  .get('/auth/profile').auth(ctx.tokens[indice], { type: 'bearer' });
const licencia = (ctx: Contexto, id = ctx.licencias[0].id) => ctx.db.getRepository(Licencia).findOneByOrFail({ id });
// Las fechas de estas fixtures no cruzan un cambio horario ni un aniversario bisiesto.
// Los límites del calendario Chihuahua se prueban en la suite unitaria del calendario.
function anios(fecha: Date, cantidad = 1) {
  const resultado = new Date(fecha);
  resultado.setUTCFullYear(resultado.getUTCFullYear() + cantidad);
  return resultado;
}
async function estado(db: DataSource) {
  return {
    usuarios: await db.getRepository(Usuario).createQueryBuilder('u').addSelect('u.passwordHash').orderBy('u.id').getMany(),
    negocios: await db.getRepository(Negocio).find({ order: { id: 'ASC' } }),
    sesiones: await db.getRepository(Sesion).find({ order: { id: 'ASC' } }),
    codigos: await db.getRepository(CodigoAcceso).find({ order: { id: 'ASC' } }),
    licencias: await db.getRepository(Licencia).find({ order: { id: 'ASC' } }),
    auditoria: await db.getRepository(EventoAuditoria).find({ order: { id: 'ASC' } }),
  };
}

describe('T50 — administración HTTP de licencias', () => {
  it('mantiene la gracia al renovar y cancela una solicitud temprana sin duplicar efectos', async () => {
    await conHttp(async (ctx) => {
      const antes = await estado(ctx.db);
      const inicio = ctx.reloj.ahora();
      const vencimiento = ctx.licencias[0].venceEn!;
      const solicitud = await operar(ctx, 'suspender').expect(200);
      expect(solicitud.body).toMatchObject({ estado: 'suspension_pendiente', condicionAcceso: true });
      expect(await licencia(ctx)).toMatchObject({ suspendidaEn: null,
        suspensionSolicitadaEn: inicio, bloqueoProgramadoEn: new Date(inicio.getTime() + 48 * 60 * 60 * 1000),
        venceEn: vencimiento });
      for (const indice of [1, 2]) await perfil(ctx, indice).expect(200);
      await perfil(ctx, 3).expect(200);
      const suspendido = await estado(ctx.db);
      ctx.reloj.avanzar(1000);
      await operar(ctx, 'suspender').expect(200);
      expect(await estado(ctx.db)).toEqual(suspendido);
      await operar(ctx, 'renovar').expect(200);
      expect(await licencia(ctx)).toMatchObject({ suspendidaEn: null,
        suspensionSolicitadaEn: inicio,
        bloqueoProgramadoEn: new Date(inicio.getTime() + 48 * 60 * 60 * 1000),
        venceEn: anios(vencimiento) });
      await perfil(ctx, 1).expect(200);
      ctx.reloj.avanzar(60000);
      await operar(ctx, 'reactivar').expect(200);
      const esperado = anios(vencimiento);
      expect(await licencia(ctx)).toMatchObject({ suspendidaEn: null,
        suspensionSolicitadaEn: null, bloqueoProgramadoEn: null, venceEn: esperado });
      for (const indice of [1, 2, 3]) await perfil(ctx, indice).expect(200);
      const reactivado = await estado(ctx.db);
      ctx.reloj.avanzar(1000);
      await operar(ctx, 'reactivar').expect(200);
      expect(await estado(ctx.db)).toEqual(reactivado);
      for (const clave of ['usuarios', 'negocios', 'sesiones', 'codigos'] as const) expect(reactivado[clave]).toEqual(antes[clave]);
      expect(reactivado.licencias.filter(l => l.id !== ctx.licencias[0].id)).toEqual(antes.licencias.filter(l => l.id !== ctx.licencias[0].id));
      const eventos = reactivado.auditoria.filter(e => e.licenciaId === ctx.licencias[0].id);
      expect(eventos.map(e => e.accion)).toEqual(['licencia_suspendida', 'licencia_renovada', 'licencia_reactivada']);
      for (const evento of eventos) expect(evento).toMatchObject({ actorUsuarioId: ctx.usuarios[0].id, negocioId: ctx.usuarios[1].negocioId });
      expect(eventos[2].valoresAntes).toMatchObject({ suspensionSolicitadaEn: inicio.toISOString(),
        venceEn: anios(vencimiento).toISOString() });
      expect(eventos[2].valoresDespues).toMatchObject({ suspendidaEn: null,
        suspensionSolicitadaEn: null, venceEn: esperado.toISOString() });
    });
  });

  it('acumula dos renovaciones vigentes y conserva la desactivación de una cuenta al reactivar', async () => {
    await conHttp(async (ctx) => {
      for (let i = 0; i < 2; i++) await operar(ctx, 'renovar').expect(200);
      expect((await licencia(ctx)).venceEn).toEqual(anios(ctx.licencias[0].venceEn!, 2));
      await ctx.db.getRepository(Usuario).update(ctx.usuarios[2].id, { activo: false });
      await operar(ctx, 'suspender').expect(200);
      await operar(ctx, 'reactivar').expect(200);
      await perfil(ctx, 1).expect(200);
      await perfil(ctx, 2).expect(401);
    });
  });

  it('rechaza suspender al vencimiento exacto con 409; reactivar no prolonga y renovar usa ahora', async () => {
    await conHttp(async (ctx) => {
      ctx.reloj.avanzar(1000);
      await ctx.db.getRepository(Licencia).update(ctx.licencias[0].id, { venceEn: ctx.reloj.ahora() });
      const antes = await estado(ctx.db);
      await operar(ctx, 'suspender').expect(409);
      await operar(ctx, 'reactivar').expect(200);
      expect(await estado(ctx.db)).toEqual(antes);
      await perfil(ctx, 1).expect(401);
      ctx.reloj.avanzar(1000);
      await operar(ctx, 'renovar').expect(200);
      expect((await licencia(ctx)).venceEn).toEqual(anios(ctx.reloj.ahora()));
      await perfil(ctx, 1).expect(200);
    });
  });

  it('rechaza renovar una pendiente con 409 y suspender/reactivar no inicia su vigencia', async () => {
    await conHttp(async (ctx) => {
      const id = ctx.pendiente.licenciaId;
      const antes = await estado(ctx.db);
      await operar(ctx, 'renovar', id).expect(409);
      expect(await estado(ctx.db)).toEqual(antes);
      await operar(ctx, 'suspender', id).expect(200);
      const suspendido = await estado(ctx.db);
      await operar(ctx, 'renovar', id).expect(409);
      expect(await estado(ctx.db)).toEqual(suspendido);
      await operar(ctx, 'reactivar', id).expect(200);
      expect(await licencia(ctx, id)).toMatchObject({ habilitadaEn: null, venceEn: null, suspendidaEn: null });
      expect((await estado(ctx.db)).usuarios).toEqual(antes.usuarios);
      expect((await estado(ctx.db)).codigos).toEqual(antes.codigos);
    });
  });

  it.each([1, 2])('deniega las tres operaciones al rol fixture %s sobre ambos negocios', async indice => {
    await conHttp(async (ctx) => {
      const antes = await estado(ctx.db);
      for (const accion of acciones) for (const destino of ctx.licencias) {
        await operar(ctx, accion, destino.id, ctx.tokens[indice]).expect(403);
      }
      expect(await estado(ctx.db)).toEqual(antes);
    });
  });

  it.each(['ausente', 'revocada', 'vencida'])('exige sesión de superadmin: %s', async condicion => {
    await conHttp(async (ctx) => {
      if (condicion === 'revocada') await ctx.app.get(SesionesService).revocarTodas(ctx.usuarios[0].id, ctx.reloj.ahora());
      if (condicion === 'vencida') ctx.reloj.avanzar(12 * 60 * 60 * 1000);
      const antes = await estado(ctx.db);
      for (const accion of acciones) {
        if (condicion === 'ausente') await request(ctx.app.getHttpServer()).post(`/licencias/${ctx.licencias[0].id}/${accion}`).send({}).expect(401);
        else await operar(ctx, accion).expect(401);
      }
      expect(await estado(ctx.db)).toEqual(antes);
    });
  });

  it('valida IDs y cuerpo vacío; licencia inexistente es 404 sin efectos', async () => {
    await conHttp(async (ctx) => {
      const antes = await estado(ctx.db);
      for (const accion of acciones) {
        for (const id of ['abc', 0, -1, '1.2', '4294967296']) await operar(ctx, accion, id).expect(400);
        await operar(ctx, accion, 4294967295).expect(404);
        for (const campo of ['negocioId', 'actorUsuarioId', 'ahora', 'modalidad', 'periodo', 'anios', 'venceEn', 'suspendidaEn']) {
          await operar(ctx, accion, ctx.licencias[0].id, ctx.tokens[0], { [campo]: 'no' }).expect(400);
        }
      }
      expect(await estado(ctx.db)).toEqual(antes);
    });
  });

  it('no expone cancelación definitiva, borrado ni suspensión independiente del negocio', async () => {
    await conHttp(async (ctx) => {
      const antes = await estado(ctx.db);
      for (const ruta of [`/licencias/${ctx.licencias[0].id}/cancelar`, `/negocios/${ctx.usuarios[1].negocioId}/suspender`]) {
        await request(ctx.app.getHttpServer()).post(ruta).auth(ctx.tokens[0], { type: 'bearer' }).send({}).expect(404);
      }
      await request(ctx.app.getHttpServer()).delete(`/licencias/${ctx.licencias[0].id}`).auth(ctx.tokens[0], { type: 'bearer' }).expect(404);
      expect(await estado(ctx.db)).toEqual(antes);
    });
  });

  it.each(acciones)('revierte estado y auditoría si falla registrar %s', async accion => {
    await conHttp(async (ctx) => {
      if (accion === 'reactivar') await operar(ctx, 'suspender').expect(200);
      const antes = await estado(ctx.db);
      // Único doble: fuerza el error del registrador; Guards, bloqueos y transacción son reales.
      const fallo = jest.spyOn(ctx.app.get(AuditoriaService), 'registrar').mockRejectedValueOnce(new Error(`Fallo de prueba T50 ${accion}`));
      try { await operar(ctx, accion).expect(500); } finally { fallo.mockRestore(); }
      expect(await estado(ctx.db)).toEqual(antes);
    });
  });

  it('serializa dobles suspensiones, renovaciones y reactivaciones sin duplicar tiempo ni perder años', async () => {
    await conHttp(async (ctx) => {
      await Promise.all([operar(ctx, 'suspender').expect(200), operar(ctx, 'suspender').expect(200)]);
      await Promise.all([operar(ctx, 'renovar').expect(200), operar(ctx, 'renovar').expect(200)]);
      ctx.reloj.avanzar(1000);
      await Promise.all([operar(ctx, 'reactivar').expect(200), operar(ctx, 'reactivar').expect(200)]);
      expect(await licencia(ctx)).toMatchObject({ negocioId: ctx.usuarios[1].negocioId, suspendidaEn: null,
        venceEn: anios(ctx.licencias[0].venceEn!, 2),
        suspensionSolicitadaEn: null, bloqueoProgramadoEn: null });
      for (const [accion, cantidad] of [['licencia_suspendida', 1], ['licencia_renovada', 2], ['licencia_reactivada', 1]] as const) {
        expect(await ctx.db.getRepository(EventoAuditoria).countBy({ licenciaId: ctx.licencias[0].id, accion })).toBe(cantidad);
      }
    });
  });
});
