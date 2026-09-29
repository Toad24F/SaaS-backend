import { ConsoleLogger, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { RELOJ } from '../src/comun/reloj';
import { CodigosService } from '../src/codigos/codigos.service';
import { AuditoriaService } from '../src/auditoria/auditoria.service';
import { SesionesService } from '../src/auth/services/sesiones.service';
import { Usuario } from '../src/usuarios/entities/usuario.entity';
import { Rol } from '../src/auth/enums/rol.enum';
import { ProcesadorCorreoService } from '../src/correos/procesador-correo.service';
import { conBaseMigrada } from './support/mariadb';
import { RelojPrueba } from './support/reloj';
import { prepararInvitacion, reconstruirCodigo, estadoIdentidad, derivadorPrueba, passwordPrueba } from './support/invitaciones-fase-2';

async function conHttp(ejecutar: (ctx: any) => Promise<void>) {
  await conBaseMigrada(async (db) => {
    const fixture = await prepararInvitacion(db);
    const reloj = new RelojPrueba(fixture.activar.ahora);
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DataSource).useValue(db).overrideProvider(RELOJ).useValue(reloj)
      .overrideProvider(CodigosService).useValue(new CodigosService(new AuditoriaService(), derivadorPrueba)).compile();
    const app = modulo.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    const logs: unknown[] = [];
    const espias = (['log', 'error', 'warn', 'debug', 'verbose'] as const).map((metodo) =>
      jest.spyOn(ConsoleLogger.prototype, metodo).mockImplementation((...datos) => { logs.push(datos); }));
    try {
      await app.init();
      const sesion = await app.get(SesionesService).crear(fixture.actor.id, reloj.ahora());
      const token = app.get(JwtService).sign({ sub: fixture.actor.id, sesionId: sesion.id,
        rol: Rol.SUPERADMIN, negocioId: null, email: fixture.actor.email, nombre: fixture.actor.nombre });
      // Cada petición pública abre una ventana nueva; el límite real se verifica en T46/T73.
      const activar = (datos = fixture.activar) => {
        reloj.avanzar(60000);
        const { ahora: _ahora, ...body } = datos;
        return request(app.getHttpServer()).post('/auth/activar-administrador').send(body);
      };
      await ejecutar({ ...fixture, datosActivacion: fixture.activar, db, app, reloj, token, activar, logs });
      expect(JSON.stringify(logs)).not.toContain(fixture.activar.codigo);
      expect(JSON.stringify(logs)).not.toContain(passwordPrueba);
    } finally { await app.close(); espias.forEach((espia) => espia.mockRestore()); }
  });
}

describe('M1-T041–T044: HTTP completo sin secretos', () => {
  it('alta, corrección, reemisión, activación y login devuelven estados seguros', async () => {
    await conHttp(async (ctx) => {
      const crear = await request(ctx.app.getHttpServer()).post('/negocios').auth(ctx.token, { type: 'bearer' })
        .send({ nombre: 'Dos', identificadorPublico: 'dos', rfc: 'ABC010101AB1', emailAdministrador: 'dos@example.test' }).expect(201);
      expect(crear.body).not.toHaveProperty('codigo');
      expect(crear.body).not.toHaveProperty('administradorId');
      const correo = await request(ctx.app.getHttpServer()).patch(`/negocios/${ctx.alta.negocioId}/correo-administrador`)
        .auth(ctx.token, { type: 'bearer' }).send({ correo: ' NUEVO@EXAMPLE.TEST ' }).expect(200);
      expect(correo.body).not.toHaveProperty('codigo');
      const reemitido = await request(ctx.app.getHttpServer()).post(`/negocios/${ctx.alta.negocioId}/reemitir-codigo`)
        .auth(ctx.token, { type: 'bearer' }).send({}).expect(201);
      expect(reemitido.body.estadoEnvio).toBe('pendiente');
      const codigo = await reconstruirCodigo(ctx.db);
      const activado = await ctx.activar({ ...ctx.datosActivacion, correo: 'nuevo@example.test', codigo }).expect(200);
      expect(activado.body).toMatchObject({ negocioId: ctx.alta.negocioId, email: 'nuevo@example.test', activo: true });
      expect(activado.body).not.toHaveProperty('passwordHash');
      const login = await request(ctx.app.getHttpServer()).post('/auth/login')
        .send({ email: 'nuevo@example.test', password: passwordPrueba }).expect(200);
      expect(login.body.accessToken).toEqual(expect.any(String));
      expect(JSON.stringify({ crear: crear.body, correo: correo.body, reemitido: reemitido.body, activado: activado.body })).not.toContain(codigo);
      expect(JSON.stringify(ctx.logs)).not.toContain(codigo);
    });
  });

  it.each(['correo', 'vencido', 'usado', 'sustituido', 'extra', 'negocio'])('rechaza %s sin cambios de identidad ni secretos en respuesta/logs', async (motivo) => {
    await conHttp(async (ctx) => {
      let datos = { ...ctx.datosActivacion };
      if (motivo === 'correo') datos.correo = 'otro@example.test';
      if (motivo === 'vencido') ctx.reloj.fijar(ctx.alta.expiraEn);
      if (motivo === 'usado') await ctx.activar().expect(200);
      if (motivo === 'sustituido') await ctx.altas.reemitirCodigoInicial({ ...ctx.gestionar, ahora: ctx.reloj.ahora() });
      if (motivo === 'extra') datos = { ...datos, rol: Rol.SUPERADMIN } as typeof datos;
      if (motivo === 'negocio') datos.negocioId += 1;
      const antes = await estadoIdentidad(ctx.db);
      const respuesta = await ctx.activar(datos).expect(motivo === 'extra' ? 400 : 409);
      expect(await estadoIdentidad(ctx.db)).toEqual(antes);
      expect(JSON.stringify(respuesta.body)).not.toContain(ctx.datosActivacion.codigo);
    });
  });

  it('exige correo/negocio y RFC, valida campos extra y protege corrección por sesión/rol', async () => {
    await conHttp(async (ctx) => {
      for (const campo of ['correo', 'negocioId']) {
        const datos = { ...ctx.datosActivacion };
        delete datos[campo];
        await ctx.activar(datos).expect(400);
      }
      await request(ctx.app.getHttpServer()).post('/negocios').auth(ctx.token, { type: 'bearer' })
        .send({ nombre: 'Falta RFC', identificadorPublico: 'falta', emailAdministrador: 'falta@example.test' }).expect(400);
      const ruta = `/negocios/${ctx.alta.negocioId}/correo-administrador`;
      await request(ctx.app.getHttpServer()).patch(ruta).send({ correo: 'nuevo@example.test' }).expect(401);
      await request(ctx.app.getHttpServer()).patch(ruta).auth(ctx.token, { type: 'bearer' }).send({ correo: 'no-correo' }).expect(400);
      await request(ctx.app.getHttpServer()).patch(ruta).auth(ctx.token, { type: 'bearer' }).send({ correo: 'nuevo@example.test', negocioId: 9 }).expect(400);
      await ctx.activar().expect(200);
      for (const rol of [Rol.ADMIN_NEGOCIO, Rol.RECEPCIONISTA, Rol.PROFESIONAL]) {
        const usuario = rol === Rol.ADMIN_NEGOCIO ? await ctx.db.getRepository(Usuario).findOneByOrFail({ negocioId: ctx.alta.negocioId, rol }) : await ctx.db.getRepository(Usuario).save({ negocioId: ctx.alta.negocioId, nombre: rol,
          email: `${rol}@example.test`, rol, passwordHash: 'hash-test', activo: true, activadoEn: ctx.reloj.ahora() });
        // Cuentas completas con licencia vigente: el rechazo procede del rol, no del estado comercial.
        const sesion = await ctx.app.get(SesionesService).crear(usuario.id, ctx.reloj.ahora());
        const token = ctx.app.get(JwtService).sign({ sub: usuario.id, sesionId: sesion.id, rol, negocioId: usuario.negocioId });
        await request(ctx.app.getHttpServer()).patch(ruta).auth(token, { type: 'bearer' }).send({ correo: 'nuevo@example.test' }).expect(403);
      }
    });
  });

  it('autoriza recuperación sin código, muestra fallo sanitizado y recupera sin levantar bloqueos', async () => {
    await conHttp(async (ctx) => {
      const activado = await ctx.activar().expect(200);
      await ctx.db.query('UPDATE usuarios SET activo = 0 WHERE id = ?', [activado.body.id]);
      await ctx.db.query('UPDATE licencias SET suspendida_en = ?', [ctx.reloj.ahora()]);
      const autorizacion = await request(ctx.app.getHttpServer()).post(`/auth/administradores/${activado.body.id}/autorizar-recuperacion`)
        .auth(ctx.token, { type: 'bearer' }).send({}).expect(201);
      const codigo = await reconstruirCodigo(ctx.db);
      expect(autorizacion.body).not.toHaveProperty('codigo');
      const transporte = { enviar: jest.fn().mockRejectedValue(new Error(`Proveedor secreto ${codigo}`)) };
      const procesador = new ProcesadorCorreoService(ctx.db, transporte, derivadorPrueba, ctx.reloj);
      await procesador.procesarUno(); // Descarta activación consumida.
      expect((await procesador.procesarUno())!.estado).toBe('fallido');
      const consulta = await request(ctx.app.getHttpServer()).get(`/negocios/${ctx.alta.negocioId}/envios`)
        .auth(ctx.token, { type: 'bearer' }).expect(200);
      expect(consulta.body.at(-1)).toMatchObject({ estado: 'fallido', confirmadoEn: null, ultimoError: 'No se pudo entregar el correo.' });
      ctx.reloj.avanzar(60000);
      await request(ctx.app.getHttpServer()).post('/auth/recuperar-contrasena').send({ codigo, password: passwordPrueba + '-nueva' }).expect(204);
      const [admin] = await ctx.db.query('SELECT activo FROM usuarios WHERE id = ?', [activado.body.id]);
      expect(admin.activo).toBe(0);
      expect(JSON.stringify({ autorizacion: autorizacion.body, consulta: consulta.body, logs: ctx.logs })).not.toContain(codigo);
    });
  });
});
