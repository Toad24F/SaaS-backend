import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { Rol } from '../src/auth/enums/rol.enum';
import { SesionesService } from '../src/auth/services/sesiones.service';
import { BloqueoHorario } from '../src/bloqueos/entities/bloqueo-horario.entity';
import { RELOJ } from '../src/comun/reloj';
import { Licencia } from '../src/licencias/entities/licencia.entity';
import { Negocio } from '../src/negocios/entities/negocio.entity';
import { Usuario } from '../src/usuarios/entities/usuario.entity';
import { conBaseMigrada } from './support/mariadb';
import { RelojPrueba } from './support/reloj';

const INICIO = new Date('2026-07-01T12:00:00.000Z');
const FECHA = '2026-07-06';
const HORA_48 = 48 * 60 * 60 * 1000;

interface Escenario {
  app: INestApplication; db: DataSource; reloj: RelojPrueba;
  usuarios: Record<string, Usuario>;
  negocioA: Negocio; negocioB: Negocio; licenciaA: Licencia;
  perfiles: Record<string, number>; sedes: Record<string, number>; servicioId: number;
}

// La base desechable contiene dos negocios y perfiles distintos para probar IDs cruzados.
async function conHttp(ejecutar: (ctx: Escenario) => Promise<void>) {
  await conBaseMigrada(async (db) => {
    const reloj = new RelojPrueba(INICIO);
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DataSource).useValue(db).overrideProvider(RELOJ).useValue(reloj).compile();
    const app = modulo.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true,
      forbidNonWhitelisted: true }));
    try {
      await app.init();
      const negocios: Negocio[] = [];
      const licencias: Licencia[] = [];
      for (const letra of ['a', 'b']) {
        const negocio = await db.getRepository(Negocio).save({ nombre: `Negocio ${letra}`,
          slug: `seguridad-agenda-${letra}`, emailContacto: `${letra}@agenda.test`,
          creadoEn: reloj.ahora(), activadoEn: reloj.ahora(),
          limiteSucursalesActivas: 3 });
        negocios.push(negocio);
        licencias.push(await db.getRepository(Licencia).save({ negocioId: negocio.id,
          habilitadaEn: reloj.ahora(),
          venceEn: new Date(reloj.ahora().getTime() + 365 * 86400000),
          suspendidaEn: null, creadoEn: reloj.ahora() }));
      }
      const usuarios: Record<string, Usuario> = {};
      for (const [nombre, rol, negocioId] of [
        ['super', Rol.SUPERADMIN, null],
        ['adminA', Rol.ADMIN_NEGOCIO, negocios[0].id],
        ['profA', Rol.PROFESIONAL, negocios[0].id],
        ['profA2', Rol.PROFESIONAL, negocios[0].id],
        ['recepcionA', Rol.RECEPCIONISTA, negocios[0].id],
        ['adminB', Rol.ADMIN_NEGOCIO, negocios[1].id],
        ['profB', Rol.PROFESIONAL, negocios[1].id],
      ] as const) {
        usuarios[nombre] = await db.getRepository(Usuario).save({ negocioId, nombre,
          email: `${nombre}@agenda.test`, passwordHash: 'hash', rol, activo: true,
          creadoEn: reloj.ahora(), activadoEn: reloj.ahora() });
      }
      const perfiles: Record<string, number> = {};
      const sedes: Record<string, number> = {};
      for (const nombre of ['profA', 'profA2', 'profB']) {
        const usuario = usuarios[nombre];
        const alta = await db.query('INSERT INTO personal (negocio_id, usuario_id) VALUES (?, ?)',
          [usuario.negocioId, usuario.id]);
        perfiles[nombre] = Number(alta.insertId);
      }
      for (const [nombre, negocioId] of [['sedeA', negocios[0].id],
        ['sedeB', negocios[1].id]] as const) {
        const alta = await db.query(`INSERT INTO sucursales
          (negocio_id,nombre,direccion,telefono,zona_horaria,activo)
          VALUES (?,?,'Calle Uno','6141234567','America/Phoenix',1)`, [negocioId, nombre]);
        sedes[nombre] = Number(alta.insertId);
      }
      for (const nombre of ['profA', 'profA2', 'profB']) {
        const sede = nombre === 'profB' ? sedes.sedeB : sedes.sedeA;
        await db.query(`INSERT INTO personal_sucursales
          (negocio_id, personal_id, sucursal_id) VALUES (?, ?, ?)`,
        [usuarios[nombre].negocioId, perfiles[nombre], sede]);
      }
      const servicio = await db.query(`INSERT INTO servicios
        (negocio_id,nombre,costo,duracion_minutos) VALUES (?,'Consulta',0,30)`,
      [negocios[0].id]);
      await ejecutar({ app, db, reloj, usuarios, negocioA: negocios[0],
        negocioB: negocios[1], licenciaA: licencias[0], perfiles, sedes,
        servicioId: Number(servicio.insertId) });
    } finally { await app.close(); }
  });
}

async function token(ctx: Escenario, usuario: Usuario) {
  const sesion = await ctx.app.get(SesionesService).crear(usuario.id, ctx.reloj.ahora());
  return ctx.app.get(JwtService).sign({ sub: usuario.id, sesionId: sesion.id,
    rol: usuario.rol, negocioId: usuario.negocioId });
}

const bloqueo = (personalId: number | null, sucursalId: number | null) => ({
  personalId, sucursalId, tipo: 'vacaciones', motivo: 'Ausencia',
  fechaInicio: FECHA, fechaFin: FECHA, inicioMinutos: 600, finMinutos: 660,
});

describe('M1-T131: permisos HTTP de horarios y bloqueos', () => {
  it('aísla semana, excepciones y atención por negocio, perfil y sucursal', async () => {
    await conHttp(async (ctx) => {
      const http = ctx.app.getHttpServer();
      const admin = await token(ctx, ctx.usuarios.adminA);
      const propio = await token(ctx, ctx.usuarios.profA);
      const ajeno = await token(ctx, ctx.usuarios.adminB);
      const ruta = `/profesionales/${ctx.perfiles.profA}`;
      const otra = `/profesionales/${ctx.perfiles.profA2}`;
      const cruzada = `/profesionales/${ctx.perfiles.profB}`;
      const atencion = `atencion?desde=${FECHA}&hasta=${FECHA}`;
      for (const sufijo of ['horario', 'excepciones', atencion]) {
        await request(http).get(`${ruta}/${sufijo}`).auth(ajeno, { type: 'bearer' }).expect(404);
        await request(http).get(`${cruzada}/${sufijo}`).auth(admin, { type: 'bearer' }).expect(404);
        await request(http).get(`${otra}/${sufijo}`).auth(propio, { type: 'bearer' }).expect(403);
      }
      for (const destino of [cruzada, otra]) {
        const actor = destino === cruzada ? admin : propio;
        const estado = destino === cruzada ? 404 : 403;
        await request(http).put(`${destino}/horario`).auth(actor, { type: 'bearer' })
          .send({ franjas: [] }).expect(estado);
        await request(http).put(`${destino}/excepciones/${FECHA}`)
          .auth(actor, { type: 'bearer' })
          .send({ sucursalId: ctx.sedes.sedeA, franjas: [] }).expect(estado);
        await request(http).delete(`${destino}/excepciones/${FECHA}`)
          .query({ sucursalId: ctx.sedes.sedeA })
          .auth(actor, { type: 'bearer' }).expect(estado);
      }
      const semanaAjena = { franjas: [{ diaSemana: 1, orden: 0,
        sucursalId: ctx.sedes.sedeB, inicioMinutos: 540, finMinutos: 600,
        descansoInicioMinutos: null, descansoFinMinutos: null, activo: true }] };
      await request(http).put(`${ruta}/horario`).auth(admin, { type: 'bearer' })
        .send(semanaAjena).expect(404);
      await request(http).put(`${ruta}/excepciones/${FECHA}`)
        .auth(propio, { type: 'bearer' })
        .send({ sucursalId: ctx.sedes.sedeB, franjas: [] }).expect(404);
      expect((await request(http).get(`${ruta}/horario`).auth(admin, { type: 'bearer' })
        .expect(200)).body).toEqual([]);
      expect((await request(http).get(`${ruta}/excepciones`).auth(propio, { type: 'bearer' })
        .expect(200)).body).toEqual([]);
    });
  });

  it('rechaza filtros y cambios de alcance de bloqueos sin modificar la fila', async () => {
    await conHttp(async (ctx) => {
      const http = ctx.app.getHttpServer();
      const admin = await token(ctx, ctx.usuarios.adminA);
      const propio = await token(ctx, ctx.usuarios.profA);
      const ajeno = await token(ctx, ctx.usuarios.adminB);
      const bloqueado = (await request(http).post('/bloqueos').auth(admin, { type: 'bearer' })
        .send(bloqueo(ctx.perfiles.profA, ctx.sedes.sedeA)).expect(201)).body;
      const antes = await ctx.db.getRepository(BloqueoHorario).findOneByOrFail({ id: bloqueado.id });
      await request(http).get('/bloqueos').query({ personalId: ctx.perfiles.profA2 })
        .auth(propio, { type: 'bearer' }).expect(403);
      await request(http).get('/bloqueos').query({ personalId: ctx.perfiles.profB })
        .auth(admin, { type: 'bearer' }).expect(404);
      await request(http).get('/bloqueos').query({ sucursalId: ctx.sedes.sedeB })
        .auth(admin, { type: 'bearer' }).expect(404);
      await request(http).post('/bloqueos').auth(propio, { type: 'bearer' })
        .send(bloqueo(null, ctx.sedes.sedeA)).expect(403);
      await request(http).post('/bloqueos').auth(admin, { type: 'bearer' })
        .send(bloqueo(ctx.perfiles.profA, ctx.sedes.sedeB)).expect(404);
      await request(http).patch(`/bloqueos/${bloqueado.id}`)
        .auth(propio, { type: 'bearer' }).send({ personalId: null }).expect(403);
      await request(http).patch(`/bloqueos/${bloqueado.id}`)
        .auth(propio, { type: 'bearer' })
        .send({ personalId: ctx.perfiles.profA2 }).expect(403);
      await request(http).patch(`/bloqueos/${bloqueado.id}`)
        .auth(propio, { type: 'bearer' })
        .send({ sucursalId: ctx.sedes.sedeB }).expect(404);
      await request(http).patch(`/bloqueos/${bloqueado.id}`)
        .auth(ajeno, { type: 'bearer' }).send({ motivo: 'Ajeno' }).expect(404);
      await request(http).delete(`/bloqueos/${bloqueado.id}`)
        .auth(ajeno, { type: 'bearer' }).expect(404);
      expect(await ctx.db.getRepository(BloqueoHorario).findOneByOrFail({ id: bloqueado.id }))
        .toEqual(antes);
      await request(http).patch(`/bloqueos/${bloqueado.id}`)
        .auth(propio, { type: 'bearer' }).send({ motivo: 'Mi ausencia' }).expect(200);
    });
  });
});

type Metodo = 'get' | 'put' | 'patch' | 'post' | 'delete';
interface CasoRuta {
  metodo: Metodo; ruta: string; cuerpo?: Record<string, unknown>;
  antes?: number;
}

// Construye la misma petición antes, en el límite exacto y después del bloqueo.
function enviar(http: ReturnType<INestApplication['getHttpServer']>, caso: CasoRuta, jwt: string) {
  const llamada = caso.metodo === 'get' ? request(http).get(caso.ruta)
    : caso.metodo === 'put' ? request(http).put(caso.ruta)
      : caso.metodo === 'patch' ? request(http).patch(caso.ruta)
        : caso.metodo === 'delete' ? request(http).delete(caso.ruta)
          : request(http).post(caso.ruta);
  const autenticada = llamada.auth(jwt, { type: 'bearer' });
  return caso.cuerpo === undefined ? autenticada : autenticada.send(caso.cuerpo);
}

describe('M1-T132: corte de acceso en rutas nuevas', () => {
  it('aplica a lectura y escritura con sesiones abiertas antes, en y después de 48 horas', async () => {
    await conHttp(async (ctx) => {
      const http = ctx.app.getHttpServer();
      const superInicial = await token(ctx, ctx.usuarios.super);
      const suspension = await request(http).post(`/licencias/${ctx.licenciaA.id}/suspender`)
        .auth(superInicial, { type: 'bearer' }).send({}).expect(200);
      expect(suspension.body.bloqueoProgramadoEn)
        .toBe(new Date(INICIO.getTime() + HORA_48).toISOString());
      // Las sesiones se abren dentro de la gracia y siguen vivas al llegar al límite.
      ctx.reloj.fijar(new Date(INICIO.getTime() + HORA_48 - 60_000));
      const admin = await token(ctx, ctx.usuarios.adminA);
      const profesional = await token(ctx, ctx.usuarios.profA);
      const superadmin = await token(ctx, ctx.usuarios.super);
      const perfil = `/profesionales/${ctx.perfiles.profA}`;
      const sede = ctx.sedes.sedeA;
      const adminRutas: CasoRuta[] = [
        { metodo: 'get', ruta: '/sucursales' },
        { metodo: 'get', ruta: '/sucursales/cupo' },
        { metodo: 'get', ruta: `/sucursales/${sede}` },
        { metodo: 'post', ruta: '/sucursales', antes: 201,
          cuerpo: { nombre: 'Otra sede', direccion: 'Calle Dos',
            telefono: '6141234568', zonaHoraria: 'America/Phoenix' } },
        { metodo: 'patch', ruta: `/sucursales/${sede}`, cuerpo: { nombre: 'sedeA' } },
        { metodo: 'post', ruta: '/sucursales/999999/desactivar', cuerpo: {}, antes: 404 },
        { metodo: 'post', ruta: '/sucursales/999999/reactivar', cuerpo: {}, antes: 404 },
        { metodo: 'delete', ruta: '/sucursales/999999', antes: 404 },
        { metodo: 'get', ruta: '/servicios' },
        { metodo: 'get', ruta: `/servicios/${ctx.servicioId}` },
        { metodo: 'post', ruta: '/servicios', antes: 201,
          cuerpo: { nombre: 'Otro servicio', costo: '0.00', duracionMinutos: 30 } },
        { metodo: 'patch', ruta: `/servicios/${ctx.servicioId}`,
          cuerpo: { nombre: 'Consulta' } },
        { metodo: 'post', ruta: '/servicios/999999/desactivar', cuerpo: {}, antes: 404 },
        { metodo: 'post', ruta: '/servicios/999999/reactivar', cuerpo: {}, antes: 404 },
        { metodo: 'delete', ruta: '/servicios/999999', antes: 404 },
        { metodo: 'get', ruta: '/profesionales' },
        { metodo: 'get', ruta: perfil },
        { metodo: 'post', ruta: '/profesionales', cuerpo: {}, antes: 400 },
        { metodo: 'patch', ruta: perfil, cuerpo: { nombre: 'profA' } },
        { metodo: 'post', ruta: '/profesionales/999999/desactivar', cuerpo: {}, antes: 404 },
        { metodo: 'post', ruta: '/profesionales/999999/reactivar', cuerpo: {}, antes: 404 },
        { metodo: 'delete', ruta: '/profesionales/999999', antes: 404 },
        { metodo: 'get', ruta: `${perfil}/sucursales` },
        { metodo: 'put', ruta: `${perfil}/sucursales`, cuerpo: { sucursalIds: [sede] } },
        { metodo: 'get', ruta: `${perfil}/servicios` },
        { metodo: 'put', ruta: `${perfil}/servicios`, cuerpo: { servicioIds: [] } },
        { metodo: 'get', ruta: '/recepcionistas' },
        { metodo: 'post', ruta: '/recepcionistas', cuerpo: {}, antes: 400 },
        { metodo: 'get', ruta: '/recepcionistas/999999', antes: 404 },
        { metodo: 'post', ruta: '/recepcionistas/999999/desactivar', cuerpo: {}, antes: 404 },
        { metodo: 'post', ruta: '/recepcionistas/999999/reactivar', cuerpo: {}, antes: 404 },
        { metodo: 'post', ruta: '/recepcionistas/999999/restablecer-contrasena',
          cuerpo: {}, antes: 400 },
      ];
      const compartidas: CasoRuta[] = [
        { metodo: 'get', ruta: `${perfil}/horario` },
        { metodo: 'put', ruta: `${perfil}/horario`, cuerpo: { franjas: [] } },
        { metodo: 'get', ruta: `${perfil}/excepciones` },
        { metodo: 'put', ruta: `${perfil}/excepciones/${FECHA}`,
          cuerpo: { sucursalId: sede, franjas: [] } },
        { metodo: 'delete', ruta: `${perfil}/excepciones/${FECHA}?sucursalId=999999`,
          antes: 404 },
        { metodo: 'get', ruta: `${perfil}/atencion?desde=${FECHA}&hasta=${FECHA}` },
        { metodo: 'get', ruta: '/bloqueos' },
        { metodo: 'post', ruta: '/bloqueos', cuerpo: bloqueo(ctx.perfiles.profA, sede) },
        { metodo: 'patch', ruta: '/bloqueos/999999', cuerpo: { motivo: 'Ausencia' },
          antes: 404 },
        { metodo: 'delete', ruta: '/bloqueos/999999', antes: 404 },
        { metodo: 'get', ruta: '/licencias/mi-vigencia' },
      ];
      const matriz = [
        ...adminRutas.map((caso) => ({ ...caso, jwt: admin })),
        ...compartidas.map((caso) => ({ ...caso, jwt: admin })),
        ...compartidas.map((caso) => ({ ...caso, jwt: profesional })),
        { metodo: 'get' as const, ruta: `${perfil}/servicios`, jwt: profesional },
        { metodo: 'put' as const, ruta: `${perfil}/servicios`,
          cuerpo: { servicioIds: [] }, jwt: profesional },
      ];
      for (const caso of matriz) {
        if (caso.antes !== undefined) await enviar(http, caso, caso.jwt).expect(caso.antes);
        else await enviar(http, caso, caso.jwt).expect((res) => {
          expect(res.status).toBeGreaterThanOrEqual(200);
          expect(res.status).toBeLessThan(300);
        });
      }
      const consultasReservadas = [
        `/negocios/${ctx.negocioA.id}`,
        `/negocios/${ctx.negocioA.id}/cupo-sucursales`,
        `/negocios/${ctx.negocioA.id}/envios`,
        `/licencias/${ctx.licenciaA.id}/vigencia`,
      ];
      for (const ruta of consultasReservadas) {
        await request(http).get(ruta).auth(admin, { type: 'bearer' }).expect(403);
      }
      ctx.reloj.fijar(new Date(INICIO.getTime() + HORA_48));
      for (const caso of matriz) await enviar(http, caso, caso.jwt).expect(401);
      for (const ruta of consultasReservadas) {
        await request(http).get(ruta).auth(admin, { type: 'bearer' }).expect(401);
      }
      await request(http).get('/auth/profile').auth(admin, { type: 'bearer' }).expect(401);
      ctx.reloj.avanzar(1);
      for (const caso of matriz) await enviar(http, caso, caso.jwt).expect(401);
      for (const ruta of consultasReservadas) {
        await request(http).get(ruta).auth(admin, { type: 'bearer' }).expect(401);
      }
      // La consulta propia tampoco permite ver un negocio bloqueado.
      await request(http).get('/licencias/mi-vigencia')
        .auth(profesional, { type: 'bearer' }).expect(401);
      await request(http).get(`/licencias/${ctx.licenciaA.id}/vigencia`)
        .auth(superadmin, { type: 'bearer' }).expect(200);
      await request(http).post(`/licencias/${ctx.licenciaA.id}/renovar`)
        .auth(superadmin, { type: 'bearer' }).send({}).expect(200);
      await request(http).get('/sucursales').auth(admin, { type: 'bearer' }).expect(401);
      await request(http).post(`/licencias/${ctx.licenciaA.id}/reactivar`)
        .auth(superadmin, { type: 'bearer' }).send({}).expect(200);
      await request(http).get('/sucursales').auth(admin, { type: 'bearer' }).expect(200);
    });
  });

  it('rechaza todas las rutas de un Profesional desactivado aunque conserve su sesión', async () => {
    await conHttp(async (ctx) => {
      const http = ctx.app.getHttpServer();
      const propio = await token(ctx, ctx.usuarios.profA);
      const perfil = `/profesionales/${ctx.perfiles.profA}`;
      await request(http).get(`${perfil}/horario`).auth(propio, { type: 'bearer' }).expect(200);
      await ctx.db.getRepository(Usuario).update(ctx.usuarios.profA.id, { activo: false });
      const rutas: CasoRuta[] = [
        { metodo: 'get', ruta: `${perfil}/servicios` },
        { metodo: 'put', ruta: `${perfil}/servicios`, cuerpo: { servicioIds: [] } },
        { metodo: 'get', ruta: `${perfil}/horario` },
        { metodo: 'put', ruta: `${perfil}/horario`, cuerpo: { franjas: [] } },
        { metodo: 'get', ruta: `${perfil}/excepciones` },
        { metodo: 'put', ruta: `${perfil}/excepciones/${FECHA}`,
          cuerpo: { sucursalId: ctx.sedes.sedeA, franjas: [] } },
        { metodo: 'get', ruta: `${perfil}/atencion?desde=${FECHA}&hasta=${FECHA}` },
        { metodo: 'get', ruta: '/bloqueos' },
        { metodo: 'post', ruta: '/bloqueos',
          cuerpo: bloqueo(ctx.perfiles.profA, ctx.sedes.sedeA) },
        { metodo: 'get', ruta: '/licencias/mi-vigencia' },
      ];
      for (const caso of rutas) await enviar(http, caso, propio).expect(401);
      expect(await ctx.db.getRepository(BloqueoHorario).count()).toBe(0);
    });
  });
});
