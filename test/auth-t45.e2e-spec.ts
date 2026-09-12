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
import { Rol } from '../src/auth/enums/rol.enum';
import { PoliticaContrasenasService } from '../src/auth/services/politica-contrasenas.service';
import { conBaseMigrada } from './support/mariadb';
import { RelojPrueba } from './support/reloj';

const password = 'contraseña-segura-t45';

// Cada caso arranca la aplicación real sobre una base nueva, sin sustituir Guards.
async function conHttp(ejecutar: (ctx: {
  app: INestApplication; db: DataSource; reloj: RelojPrueba;
  usuario: Usuario; licencia: Licencia;
}) => Promise<void>) {
  await conBaseMigrada(async (db) => {
    const reloj = new RelojPrueba(new Date(Date.now() + 2000));
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DataSource).useValue(db)
      .overrideProvider(RELOJ).useValue(reloj)
      .compile();
    const app = modulo.createNestApplication();
    // Las opciones son las mismas que usa main.ts en producción.
    app.useGlobalPipes(new ValidationPipe({
      whitelist: true, forbidNonWhitelisted: true, transform: true,
    }));
    try {
      await app.init();
      const negocio = await db.getRepository(Negocio).save({
        nombre: 'Negocio T45', slug: 'negocio-t45', activadoEn: reloj.ahora(),
        emailContacto: 'contacto@example.test', telefonoContacto: null,
      });
      const licencia = await db.getRepository(Licencia).save({
        negocioId: negocio.id, habilitadaEn: reloj.ahora(),
        venceEn: new Date(reloj.ahora().getTime() + 86400000), suspendidaEn: null,
      });
      const usuario = await db.getRepository(Usuario).save({
        negocioId: negocio.id, nombre: 'Admin T45', email: 'admin@example.test',
        passwordHash: await new PoliticaContrasenasService().generarHash(password),
        rol: Rol.ADMIN_NEGOCIO, activo: true, activadoEn: reloj.ahora(),
      });
      await ejecutar({ app, db, reloj, usuario, licencia });
    } finally {
      await app.close();
    }
  });
}

function login(app: INestApplication) {
  return request(app.getHttpServer()).post('/auth/login')
    .send({ email: 'admin@example.test', password });
}

describe('T45 — login, perfil y logout HTTP', () => {
  it('devuelve solo datos públicos y logout revoca únicamente la sesión presentada', async () => {
    await conHttp(async ({ app, db, usuario }) => {
      const primera = await login(app).expect(200);
      const segunda = await login(app).expect(200);
      expect(primera.body.usuario).toEqual({
        id: usuario.id, nombre: usuario.nombre, email: usuario.email,
        rol: usuario.rol, negocioId: usuario.negocioId,
      });
      const token = primera.body.accessToken;
      const perfil = await request(app.getHttpServer()).get('/auth/profile')
        .auth(token, { type: 'bearer' }).expect(200);
      expect(perfil.body.user).toEqual({
        sub: usuario.id, nombre: usuario.nombre, email: usuario.email,
        rol: usuario.rol, negocioId: usuario.negocioId, sesionId: expect.any(String),
      });
      expect(JSON.stringify([primera.body, perfil.body])).not.toContain(usuario.passwordHash);
      const payload = app.get(JwtService).verify(token);
      expect(payload).not.toHaveProperty('passwordHash');
      await request(app.getHttpServer()).post('/auth/logout').auth(token, { type: 'bearer' }).expect(204);
      expect((await db.getRepository(Sesion).findOneByOrFail({ id: payload.sesionId })).revocadaEn).not.toBeNull();
      await request(app.getHttpServer()).get('/auth/profile').auth(token, { type: 'bearer' }).expect(401);
      await request(app.getHttpServer()).post('/auth/logout').auth(token, { type: 'bearer' }).expect(401);
      await request(app.getHttpServer()).get('/auth/profile').auth(segunda.body.accessToken, { type: 'bearer' }).expect(200);
    });
  });

  it.each([{}, { email: 'incorrecto', password }, { email: 'admin@example.test', password: 123 },
    { email: 'admin@example.test', password, negocioId: 99 }])('rechaza entrada inválida %j sin crear sesiones', async (body) => {
    await conHttp(async ({ app, db }) => {
      await request(app.getHttpServer()).post('/auth/login').send(body).expect(400);
      expect(await db.getRepository(Sesion).count()).toBe(0);
    });
  });

  it('unifica errores para correo desconocido, contraseña incorrecta, cuenta inactiva y pendiente', async () => {
    await conHttp(async ({ app, db, usuario }) => {
      const enviar = (email: string, clave: string) => request(app.getHttpServer())
        .post('/auth/login').send({ email, password: clave }).expect(401);
      const desconocido = await enviar('nadie@example.test', password);
      expect((await enviar(usuario.email, 'incorrecta')).body).toEqual(desconocido.body);
      // Una contraseña corta incorrecta también debe recibir el error uniforme de credenciales.
      expect((await enviar(usuario.email, 'x')).body).toEqual(desconocido.body);
      await db.getRepository(Usuario).update(usuario.id, { activo: false });
      expect((await enviar(usuario.email, password)).body).toEqual(desconocido.body);
      // La cuenta pendiente debe respetar la restricción SQL: no posee credenciales.
      await db.getRepository(Usuario).update(usuario.id, {
        activo: true, activadoEn: null, nombre: null, passwordHash: null,
      });
      expect((await enviar(usuario.email, password)).body).toEqual(desconocido.body);
    });
  });

  it('bloquea el sexto intento durante un minuto sin extender el bloqueo', async () => {
    await conHttp(async ({ app, reloj }) => {
      const intento = () => request(app.getHttpServer()).post('/auth/login')
        .send({ email: 'nadie@example.test', password });
      for (let i = 0; i < 5; i++) await intento().expect(401);
      await intento().expect(429);
      reloj.avanzar(59999);
      await intento().expect(429);
      reloj.avanzar(1);
      await login(app).expect(200);
    });
  });

  it.each(['suspendida', 'vencida'])('permite logout con licencia %s aunque perfil devuelva 401', async (estado) => {
    await conHttp(async ({ app, db, reloj, licencia }) => {
      const { body } = await login(app).expect(200);
      reloj.avanzar(1000);
      await db.getRepository(Licencia).update(licencia.id, estado === 'suspendida'
        ? { suspendidaEn: reloj.ahora() } : { venceEn: reloj.ahora() });
      await request(app.getHttpServer()).get('/auth/profile').auth(body.accessToken, { type: 'bearer' }).expect(401);
      await request(app.getHttpServer()).post('/auth/logout').auth(body.accessToken, { type: 'bearer' }).expect(204);
      await request(app.getHttpServer()).post('/auth/logout').auth(body.accessToken, { type: 'bearer' }).expect(401);
    });
  });

  it('rechaza sesión en el vencimiento exacto y JWT vencido, adulterado o ausente', async () => {
    await conHttp(async ({ app, reloj }) => {
      const { body } = await login(app).expect(200);
      const jwt = app.get(JwtService);
      const { exp: _exp, iat: _iat, ...payload } = jwt.verify(body.accessToken);
      const vencido = jwt.sign(payload, { expiresIn: -1 });
      for (const ruta of ['/auth/profile', '/auth/logout']) {
        const enviar = () => ruta.endsWith('profile')
          ? request(app.getHttpServer()).get(ruta) : request(app.getHttpServer()).post(ruta);
        await enviar().expect(401);
        await enviar().auth(`${body.accessToken}alterado`, { type: 'bearer' }).expect(401);
        await enviar().auth(vencido, { type: 'bearer' }).expect(401);
      }
      // El reloj de dominio comprueba el límite de la sesión sin esperar una hora real.
      reloj.avanzar(3599999);
      await request(app.getHttpServer()).get('/auth/profile').auth(body.accessToken, { type: 'bearer' }).expect(200);
      reloj.avanzar(1);
      await request(app.getHttpServer()).get('/auth/profile').auth(body.accessToken, { type: 'bearer' }).expect(401);
      await request(app.getHttpServer()).post('/auth/logout').auth(body.accessToken, { type: 'bearer' }).expect(401);
    });
  });
});
