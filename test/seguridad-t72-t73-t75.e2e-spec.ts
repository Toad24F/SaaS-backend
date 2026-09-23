import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuditoriaService } from '../src/auditoria/auditoria.service';
import { EventoAuditoria } from '../src/auditoria/entities/evento-auditoria.entity';
import { LimiteIntentos } from '../src/auth/entities/limite-intentos.entity';
import { Sesion } from '../src/auth/entities/sesion.entity';
import { RELOJ } from '../src/comun/reloj';
import { Licencia } from '../src/licencias/entities/licencia.entity';
import { Usuario } from '../src/usuarios/entities/usuario.entity';
import { UsuariosService } from '../src/usuarios/usuarios.service';
import { conBaseMigrada } from './support/mariadb';
import { RelojPrueba } from './support/reloj';
import { crearActivo, crearPendiente, crearSuperadmin, fechaSegura, PASSWORD_T51_T60, servicios } from './support/escenarios-t51-t60';

type Contexto = { app: INestApplication; db: DataSource; reloj: RelojPrueba; superadmin: Usuario };

/** Cada caso ejecuta Guards y repositorios reales sobre una base migrada desechable. */
async function conHttp(ejecutar: (ctx: Contexto) => Promise<void>) {
  await conBaseMigrada(async (db) => {
    const reloj = new RelojPrueba(fechaSegura());
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DataSource).useValue(db).overrideProvider(RELOJ).useValue(reloj).compile();
    const app = modulo.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    // Solo en pruebas: simula dos IP reales detrás de un proxy de confianza.
    app.getHttpAdapter().getInstance().set('trust proxy', true);
    try {
      await app.init();
      const superadmin = await crearSuperadmin(db, reloj.ahora());
      await ejecutar({ app, db, reloj, superadmin });
    } finally { await app.close(); }
  });
}

async function login(app: INestApplication, email: string, password = PASSWORD_T51_T60) {
  const respuesta = await request(app.getHttpServer()).post('/auth/login')
    .send({ email, password }).expect(200);
  return respuesta.body.accessToken as string;
}

function post(app: INestApplication, ruta: string, token: string, body: object = {}) {
  return request(app.getHttpServer()).post(ruta).auth(token, { type: 'bearer' }).send(body);
}

describe('T72 — expiración durante una operación autorizada', () => {
  it.each([false, true])('confirma o revierte atómicamente tras vencer la sesión, fallo=%s', async (fallar) => {
    await conHttp(async ({ app, db, reloj, superadmin }) => {
      const tenant = await crearActivo(db, superadmin.id, reloj.ahora());
      reloj.avanzar(2000);
      const token = await login(app, tenant.administrador.email);
      const sesion = await db.getRepository(Sesion).findOneByOrFail({ usuarioId: tenant.administradorId });
      reloj.fijar(new Date(sesion.expiraEn.getTime() - 1));
      const correo = `operacion-${fallar ? 'fallida' : 'exitosa'}@example.test`;
      const usuarios = app.get(UsuariosService);
      const crearOriginal = usuarios.crearRecepcionista.bind(usuarios);
      const auditoria = Reflect.get(usuarios, 'auditoria') as AuditoriaService;
      let continuar!: () => void;
      let avisar!: () => void;
      const retenido = new Promise<void>((resolver) => { continuar = resolver; });
      const iniciado = new Promise<void>((resolver) => { avisar = resolver; });
      const espia = jest.spyOn(usuarios, 'crearRecepcionista').mockImplementation(async (datos) => {
        // El Guard ya admitió la solicitud; se inicia el caso de uso al liberar la barrera.
        avisar();
        await retenido;
        return crearOriginal(datos);
      });
      const falloAuditoria = fallar
        ? jest.spyOn(auditoria, 'registrar').mockRejectedValueOnce(new Error('Fallo controlado T72'))
        : null;
      let temporizador: ReturnType<typeof setTimeout> | undefined;
      try {
        const solicitud = post(app, '/recepcionistas', token, {
          emailRecepcionista: correo, nombre: 'Operación en curso', password: PASSWORD_T51_T60,
        }).then((respuesta) => respuesta);
        // Si el Guard o la ruta terminan antes del punto de pausa, informar el HTTP real.
        await Promise.race([iniciado, solicitud.then((respuesta) => {
          throw new Error(`La operación terminó antes de pausar: HTTP ${respuesta.status}`);
        }), new Promise((_, rechazar) => {
          temporizador = setTimeout(() => rechazar(new Error('No llegó al caso de uso T72.')), 15_000);
        })]);
        reloj.avanzar(1); // Cruza exactamente el límite de 12 horas de la sesión.
        continuar(); // La operación ya autorizada puede completar o revertir su transacción.
        const respuesta = await solicitud;
        expect(respuesta.status).toBe(fallar ? 500 : 201);
      } finally {
        if (temporizador) clearTimeout(temporizador);
        continuar(); espia.mockRestore(); falloAuditoria?.mockRestore();
      }
      const cuenta = await db.getRepository(Usuario).findOneBy({ email: correo });
      if (fallar) expect(cuenta).toBeNull();
      else expect(cuenta).not.toBeNull();
      expect(await db.getRepository(EventoAuditoria).countBy({ accion: 'recepcionista_creado' }))
        .toBe(fallar ? 0 : 1);
      // Una operación ya autorizada concluye; ninguna solicitud nueva entra en el límite.
      await request(app.getHttpServer()).get('/recepcionistas')
        .auth(token, { type: 'bearer' }).expect(401);
    });
  }, 120_000);
});

describe('T73 — límite compartido por IP y solicitudes simultáneas', () => {
  it('comparte cinco intentos, serializa seis peticiones y no prolonga el bloqueo', async () => {
    await conHttp(async ({ app, db, reloj, superadmin }) => {
      const pendiente = await crearPendiente(db, superadmin.id, reloj.ahora());
      const activo = await crearActivo(db, superadmin.id, reloj.ahora());
      const recuperacion = await servicios(db).credenciales.autorizarRecuperacion({
        actorUsuarioId: superadmin.id, administradorId: activo.administradorId,
        ahora: new Date(reloj.ahora().getTime() + 2000),
      });
      expect(pendiente.codigo).not.toBe(recuperacion.codigo);
      const ip = '203.0.113.10';
      const otraIp = '203.0.113.11';
      const peticiones = [
        () => request(app.getHttpServer()).post('/auth/login').set('X-Forwarded-For', ip)
          .send({ email: 'nadie@example.test', password: PASSWORD_T51_T60 }),
        () => request(app.getHttpServer()).post('/auth/activar-administrador').set('X-Forwarded-For', ip)
          .send({ codigo: 'inexistente', nombre: 'Nadie', password: PASSWORD_T51_T60 }),
        () => request(app.getHttpServer()).post('/auth/recuperar-contrasena').set('X-Forwarded-For', ip)
          .send({ codigo: 'inexistente', password: PASSWORD_T51_T60 }),
      ];
      const resultados = await Promise.all(Array.from({ length: 6 }, (_, indice) => peticiones[indice % 3]()));
      expect(resultados.filter((r) => r.status === 429)).toHaveLength(1);
      expect(resultados.filter((r) => r.status === 400 || r.status === 401)).toHaveLength(5);
      const bloqueada = await db.getRepository(LimiteIntentos).findOneByOrFail({ origen: ip });
      expect(bloqueada.intentos).toBe(6);
      expect(bloqueada.bloqueadoHasta).toEqual(new Date(reloj.ahora().getTime() + 60_000));
      await request(app.getHttpServer()).post('/auth/login').set('X-Forwarded-For', otraIp)
        .send({ email: 'nadie@example.test', password: PASSWORD_T51_T60 }).expect(401);
      reloj.avanzar(59_999);
      await peticiones[0]().expect(429);
      expect((await db.getRepository(LimiteIntentos).findOneByOrFail({ origen: ip })).bloqueadoHasta)
        .toEqual(bloqueada.bloqueadoHasta);
      reloj.avanzar(1);
      await peticiones[0]().expect(401);
      expect((await db.getRepository(LimiteIntentos).findOneByOrFail({ origen: ip })).intentos)
        .toBe(1);
    });
  }, 120_000);
});

describe('T75 — matriz de bloqueos en rutas protegidas', () => {
  it('aplica 401, 403 y 404 y conserva bloqueos tras recuperar/restablecer', async () => {
    await conHttp(async ({ app, db, reloj, superadmin }) => {
      const primero = await crearActivo(db, superadmin.id, reloj.ahora());
      const segundo = await crearActivo(db, superadmin.id, reloj.ahora());
      reloj.avanzar(2000);
      const superToken = await login(app, superadmin.email);
      const tokenA = await login(app, primero.administrador.email);
      const tokenB = await login(app, segundo.administrador.email);
      const recepcion = await post(app, '/recepcionistas', tokenA, {
        emailRecepcionista: 'recepcion-t75@example.test', nombre: 'Recepción T75',
        password: PASSWORD_T51_T60,
      }).expect(201);
      const recepcionId = recepcion.body.id as number;
      const tokenRecepcion = await login(app, 'recepcion-t75@example.test');
      const rutas = [
        { metodo: 'get', ruta: '/auth/profile' },
        { metodo: 'post', ruta: '/auth/cambiar-contrasena', body: {
          passwordActual: PASSWORD_T51_T60, nuevaPassword: 'password-nueva-t75',
        } },
        { metodo: 'get', ruta: '/recepcionistas' },
        { metodo: 'get', ruta: `/recepcionistas/${recepcionId}` },
        { metodo: 'post', ruta: '/recepcionistas', body: {
          emailRecepcionista: 'bloqueada-t75@example.test', nombre: 'Bloqueada',
          password: PASSWORD_T51_T60,
        } },
        ...['desactivar', 'reactivar'].map((accion) => ({
          metodo: 'post', ruta: `/recepcionistas/${recepcionId}/${accion}`, body: {},
        })),
        { metodo: 'post', ruta: `/recepcionistas/${recepcionId}/restablecer-contrasena`,
          body: { nuevaPassword: 'password-nueva-t75' } },
      ] as const;
      const enviar = (ruta: typeof rutas[number], token: string) => {
        const peticion = ruta.metodo === 'get'
          ? request(app.getHttpServer()).get(ruta.ruta)
          : request(app.getHttpServer()).post(ruta.ruta).send('body' in ruta ? ruta.body : {});
        return peticion.auth(token, { type: 'bearer' });
      };
      // Un recepcionista no administra cuentas; un admin no administra negocios/licencias.
      await post(app, `/recepcionistas/${recepcionId}/desactivar`, tokenRecepcion).expect(403);
      await post(app, '/recepcionistas', tokenRecepcion, {
        emailRecepcionista: 'sin-permiso@example.test', nombre: 'Sin permiso', password: PASSWORD_T51_T60,
      }).expect(403);
      await post(app, `/licencias/${primero.licenciaId}/renovar`, tokenA).expect(403);
      await request(app.getHttpServer()).get('/negocios').auth(tokenA, { type: 'bearer' }).expect(403);
      await post(app, `/auth/administradores/${segundo.administradorId}/autorizar-recuperacion`, tokenA)
        .expect(403);
      // B no puede siquiera consultar ni mutar una cuenta de A.
      for (const ruta of rutas.filter((item) => item.ruta.startsWith(`/recepcionistas/${recepcionId}`))) {
        await enviar(ruta, tokenB).expect(404);
      }

      for (const bloqueo of ['cuenta_inactiva', 'licencia_suspendida', 'licencia_vencida']) {
        if (bloqueo === 'cuenta_inactiva') {
          await db.getRepository(Usuario).update(primero.administradorId, { activo: false });
        } else if (bloqueo === 'licencia_suspendida') {
          await db.getRepository(Usuario).update(primero.administradorId, { activo: true });
          await db.getRepository(Licencia).update(primero.licenciaId, { suspendidaEn: reloj.ahora() });
        } else {
          await db.getRepository(Licencia).update(primero.licenciaId, {
            suspendidaEn: null, venceEn: reloj.ahora(),
          });
        }
        for (const ruta of rutas) await enviar(ruta, tokenA).expect(401);
      }

      // El superadmin sigue gestionando licencias; renovar no quita una suspensión.
      const suspendidaEn = reloj.ahora();
      await db.getRepository(Licencia).update(primero.licenciaId, {
        venceEn: primero.licencia.venceEn, suspendidaEn,
      });
      await request(app.getHttpServer()).get('/negocios')
        .auth(superToken, { type: 'bearer' }).expect(200);
      await post(app, `/licencias/${primero.licenciaId}/renovar`, superToken).expect(204);
      expect((await db.getRepository(Licencia).findOneByOrFail({ id: primero.licenciaId })).suspendidaEn)
        .toEqual(suspendidaEn);
      const recuperacion = await post(app,
        `/auth/administradores/${primero.administradorId}/autorizar-recuperacion`, superToken)
        .expect(201);
      // Reinicia solo la ventana de intentos; las sesiones siguen vigentes.
      reloj.avanzar(60_000);
      await request(app.getHttpServer()).post('/auth/recuperar-contrasena')
        .send({ codigo: recuperacion.body.codigo, password: 'password-recuperada-t75' }).expect(204);
      expect((await db.getRepository(Licencia).findOneByOrFail({ id: primero.licenciaId })).suspendidaEn)
        .toEqual(suspendidaEn);
      await request(app.getHttpServer()).post('/auth/login')
        .send({ email: primero.administrador.email, password: 'password-recuperada-t75' }).expect(401);
      // Logout conserva su excepción comercial aunque la licencia siga bloqueada.
      await post(app, '/auth/logout', tokenRecepcion).expect(204);
      await post(app, '/auth/logout', tokenRecepcion).expect(401);

      await post(app, `/licencias/${primero.licenciaId}/reactivar`, superToken).expect(204);
      const adminNuevo = await login(app, primero.administrador.email, 'password-recuperada-t75');
      await post(app, `/recepcionistas/${recepcionId}/desactivar`, adminNuevo).expect(204);
      await post(app, `/recepcionistas/${recepcionId}/restablecer-contrasena`, adminNuevo,
        { nuevaPassword: 'password-restablecida-t75' }).expect(204);
      expect((await db.getRepository(Usuario).findOneByOrFail({ id: recepcionId })).activo).toBe(false);
      await request(app.getHttpServer()).post('/auth/login')
        .send({ email: 'recepcion-t75@example.test', password: 'password-restablecida-t75' })
        .expect(401);
    });
  }, 120_000);
});
