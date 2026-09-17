import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { RELOJ } from '../src/comun/reloj';
import { Rol } from '../src/auth/enums/rol.enum';
import { EventoAuditoria } from '../src/auditoria/entities/evento-auditoria.entity';
import { CodigoAcceso } from '../src/codigos/entities/codigo-acceso.entity';
import { Licencia } from '../src/licencias/entities/licencia.entity';
import { CalendarioLicenciasService } from '../src/licencias/services/calendario-licencias.service';
import { Usuario } from '../src/usuarios/entities/usuario.entity';
import { conBaseMigrada } from './support/mariadb';
import { RelojPrueba } from './support/reloj';
import { crearActivo, crearSuperadmin, fechaSegura, PASSWORD_T51_T60 } from './support/escenarios-t51-t60';

type Contexto = { app: INestApplication; db: DataSource; reloj: RelojPrueba;
  superadmin: Usuario; token: string };

/** Monta rutas, Guards, validación y MariaDB reales con un reloj explícito. */
async function conHttp(ejecutar: (ctx: Contexto) => Promise<void>, inicio = fechaSegura()) {
  await conBaseMigrada(async (db) => {
    const reloj = new RelojPrueba(inicio);
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DataSource).useValue(db).overrideProvider(RELOJ).useValue(reloj).compile();
    const app = modulo.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    try {
      await app.init();
      const superadmin = await crearSuperadmin(db, reloj.ahora());
      const token = await login(app, superadmin.email);
      await ejecutar({ app, db, reloj, superadmin, token });
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

describe('T51 y T58–T60 — recorridos HTTP completos', () => {
  it('T51 aísla dos negocios y rechaza permisos ajenos sin alterar datos', async () => {
    await conHttp(async ({ app, db, reloj, superadmin }) => {
      const primero = await crearActivo(db, superadmin.id, reloj.ahora());
      const segundo = await crearActivo(db, superadmin.id, reloj.ahora());
      reloj.avanzar(2000);
      const tokenA = await login(app, primero.administrador.email);
      const tokenB = await login(app, segundo.administrador.email);
      const alta = { emailRecepcionista: 'aislamiento@example.test', nombre: 'Recepción A',
        password: PASSWORD_T51_T60 };
      const creado = await post(app, '/recepcionistas', tokenA, alta).expect(201);
      expect(creado.body).toMatchObject({ negocioId: primero.negocioId, rol: Rol.RECEPCIONISTA });
      const destino = await db.getRepository(Usuario).findOneByOrFail({ id: creado.body.id });
      const listaB = await request(app.getHttpServer()).get('/recepcionistas')
        .auth(tokenB, { type: 'bearer' }).expect(200);
      expect(listaB.body).toEqual([]);
      const antes = await db.getRepository(Usuario).findOneByOrFail({ id: destino.id });
      const eventosAntes = await db.getRepository(EventoAuditoria).count();
      await request(app.getHttpServer()).get(`/recepcionistas/${destino.id}`)
        .auth(tokenB, { type: 'bearer' }).expect(404);
      for (const ruta of ['desactivar', 'reactivar']) {
        await post(app, `/recepcionistas/${destino.id}/${ruta}`, tokenB).expect(404);
      }
      await post(app, `/recepcionistas/${destino.id}/restablecer-contrasena`, tokenB,
        { nuevaPassword: 'password-nueva-t51' }).expect(404);
      await post(app, '/recepcionistas', tokenA, { ...alta, negocioId: segundo.negocioId })
        .expect(400);
      await post(app, '/recepcionistas', tokenA, { ...alta, rol: Rol.ADMIN_NEGOCIO })
        .expect(400);
      await post(app, `/auth/administradores/${segundo.administradorId}/autorizar-recuperacion`, tokenA)
        .expect(403);
      const tokenRecepcion = await login(app, destino.email);
      await post(app, `/recepcionistas/${destino.id}/desactivar`, tokenRecepcion).expect(403);
      await post(app, '/recepcionistas', tokenRecepcion, alta).expect(403);
      expect(await db.getRepository(Usuario).findOneByOrFail({ id: destino.id })).toEqual(antes);
      expect(await db.getRepository(EventoAuditoria).count()).toBe(eventosAntes);
    });
  });

  it('T58 recorre alta, activación, login, renovación, suspensión y reactivación anual', async () => {
    await conHttp(async ({ app, db, reloj, token, superadmin }) => {
      const alta = { nombre: 'Negocio anual', identificadorPublico: 'anual-t58',
        emailAdministrador: 'admin-t58@example.test' };
      for (const campo of ['modalidad', 'periodo']) {
        await post(app, '/negocios', token, { ...alta, [campo]: 'mensual' }).expect(400);
      }
      const creado = await post(app, '/negocios', token, alta).expect(201);
      const pendiente = await db.getRepository(Licencia).findOneByOrFail({ id: creado.body.licenciaId });
      expect(pendiente).toMatchObject({ habilitadaEn: null, venceEn: null });
      reloj.avanzar(1000);
      await request(app.getHttpServer()).post('/auth/activar-administrador').send({
        codigo: creado.body.codigo, nombre: 'Administrador anual', password: PASSWORD_T51_T60,
      }).expect(204);
      const licencia = await db.getRepository(Licencia).findOneByOrFail({ id: creado.body.licenciaId });
      expect(licencia.venceEn).toEqual(new CalendarioLicenciasService().sumarAnios(reloj.ahora()));
      const admin = await db.getRepository(Usuario).findOneByOrFail({ id: creado.body.administradorId });
      const tokenAdmin = await login(app, admin.email);
      await post(app, `/licencias/${licencia.id}/renovar`, token).expect(204);
      const renovada = await db.getRepository(Licencia).findOneByOrFail({ id: licencia.id });
      expect(renovada.venceEn).toEqual(new CalendarioLicenciasService().sumarAnios(licencia.venceEn!));
      await post(app, `/licencias/${licencia.id}/suspender`, token).expect(204);
      await request(app.getHttpServer()).get('/auth/profile')
        .auth(tokenAdmin, { type: 'bearer' }).expect(401);
      expect(await db.getRepository(Usuario).findOneByOrFail({ id: admin.id }))
        .toMatchObject({ negocioId: creado.body.negocioId, activo: true });
      reloj.avanzar(24 * 60 * 60 * 1000);
      const tokenSuperNuevo = await login(app, superadmin.email);
      await post(app, `/licencias/${licencia.id}/reactivar`, tokenSuperNuevo).expect(204);
      const activa = await db.getRepository(Licencia).findOneByOrFail({ id: licencia.id });
      expect(activa.venceEn).toEqual(new Date(renovada.venceEn!.getTime() + 24 * 60 * 60 * 1000));
      await login(app, admin.email);
    });
  });

  it('T59 verifica vencimiento exacto, renovación tardía y tiempo de pausas sucesivas bisiestas', async () => {
    await conHttp(async ({ app, db, reloj, superadmin, token }) => {
      const tenant = await crearActivo(db, superadmin.id, reloj.ahora());
      const anticipada = await crearActivo(db, superadmin.id, reloj.ahora());
      await post(app, `/licencias/${anticipada.licenciaId}/renovar`, token).expect(204);
      expect((await db.getRepository(Licencia).findOneByOrFail({ id: anticipada.licenciaId })).venceEn)
        .toEqual(new CalendarioLicenciasService().sumarAnios(anticipada.licencia.venceEn!));
      reloj.avanzar(2000);
      const tokenAdmin = await login(app, tenant.administrador.email);
      const calendario = new CalendarioLicenciasService();
      const vencimiento = tenant.licencia.venceEn!;
      reloj.fijar(new Date(vencimiento.getTime() - 1));
      await request(app.getHttpServer()).get('/auth/profile')
        .auth(tokenAdmin, { type: 'bearer' }).expect(401);
      // La sesión expira antes que la licencia: un login nuevo demuestra el límite real.
      await login(app, tenant.administrador.email);
      reloj.fijar(vencimiento);
      await request(app.getHttpServer()).post('/auth/login')
        .send({ email: tenant.administrador.email, password: PASSWORD_T51_T60 }).expect(401);
      const tokenSuper = await login(app, superadmin.email);
      await post(app, `/licencias/${tenant.licenciaId}/renovar`, tokenSuper).expect(204);
      const tardia = await db.getRepository(Licencia).findOneByOrFail({ id: tenant.licenciaId });
      expect(tardia.venceEn).toEqual(calendario.sumarAnios(vencimiento));
      await login(app, tenant.administrador.email);

      const pausa = new Date(vencimiento.getTime() + 1000);
      reloj.fijar(pausa);
      await post(app, `/licencias/${tenant.licenciaId}/suspender`, tokenSuper).expect(204);
      reloj.avanzar(30 * 24 * 60 * 60 * 1000);
      const super2 = await login(app, superadmin.email);
      await post(app, `/licencias/${tenant.licenciaId}/renovar`, super2).expect(204);
      const conservada = await db.getRepository(Licencia).findOneByOrFail({ id: tenant.licenciaId });
      expect(conservada.suspendidaEn).toEqual(pausa);
      expect(conservada.venceEn).toEqual(calendario.sumarAnios(tardia.venceEn!));
      await post(app, `/licencias/${tenant.licenciaId}/reactivar`, super2).expect(204);
      const primera = await db.getRepository(Licencia).findOneByOrFail({ id: tenant.licenciaId });
      expect(primera.venceEn).toEqual(new Date(conservada.venceEn!.getTime() + reloj.ahora().getTime() - pausa.getTime()));
      await post(app, `/licencias/${tenant.licenciaId}/suspender`, super2).expect(204);
      reloj.avanzar(7 * 24 * 60 * 60 * 1000);
      const super3 = await login(app, superadmin.email);
      await post(app, `/licencias/${tenant.licenciaId}/reactivar`, super3).expect(204);
      expect((await db.getRepository(Licencia).findOneByOrFail({ id: tenant.licenciaId })).venceEn)
        .toEqual(new Date(primera.venceEn!.getTime() + 7 * 24 * 60 * 60 * 1000));
    }, new Date('2028-02-29T18:00:00.000Z'));
  });

  it('T60 suspensión previa bloquea activación, código caduca y reactivar no inicia licencia', async () => {
    await conHttp(async ({ app, db, reloj, superadmin, token }) => {
      const creado = await post(app, '/negocios', token, {
        nombre: 'Pendiente suspendido', identificadorPublico: 'pendiente-t60',
        emailAdministrador: 'pendiente-t60@example.test',
      }).expect(201);
      await post(app, `/licencias/${creado.body.licenciaId}/suspender`, token).expect(204);
      await request(app.getHttpServer()).post('/auth/activar-administrador').send({
        codigo: creado.body.codigo, nombre: 'Pendiente', password: PASSWORD_T51_T60,
      }).expect(400);
      const codigo = await db.getRepository(CodigoAcceso).findOneByOrFail({ usuarioId: creado.body.administradorId });
      expect(codigo.consumidoEn).toBeNull();
      reloj.avanzar(48 * 60 * 60 * 1000);
      const superNuevo = await login(app, superadmin.email);
      await post(app, `/licencias/${creado.body.licenciaId}/reactivar`, superNuevo).expect(204);
      expect(await db.getRepository(Licencia).findOneByOrFail({ id: creado.body.licenciaId }))
        .toMatchObject({ habilitadaEn: null, venceEn: null, suspendidaEn: null });
      await request(app.getHttpServer()).post('/auth/activar-administrador').send({
        codigo: creado.body.codigo, nombre: 'Tarde', password: PASSWORD_T51_T60,
      }).expect(400);
      const nuevo = await post(app, `/negocios/${creado.body.negocioId}/reemitir-codigo`, superNuevo)
        .expect(201);
      expect(nuevo.body.codigo).not.toBe(creado.body.codigo);
      await request(app.getHttpServer()).post('/auth/activar-administrador').send({
        codigo: nuevo.body.codigo, nombre: 'Activado', password: PASSWORD_T51_T60,
      }).expect(204);
      const licencia = await db.getRepository(Licencia).findOneByOrFail({ id: creado.body.licenciaId });
      expect(licencia).toMatchObject({ habilitadaEn: reloj.ahora(),
        venceEn: new CalendarioLicenciasService().sumarAnios(reloj.ahora()) });
    });
  });
});
