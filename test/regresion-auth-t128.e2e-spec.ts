import { ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuditoriaService } from '../src/auditoria/auditoria.service';
import { SesionesService } from '../src/auth/services/sesiones.service';
import { CodigosService } from '../src/codigos/codigos.service';
import { RELOJ } from '../src/comun/reloj';
import { Usuario } from '../src/usuarios/entities/usuario.entity';
import { conBaseMigrada } from './support/mariadb';
import { RelojPrueba } from './support/reloj';
import { derivadorPrueba, passwordPrueba, prepararInvitacion,
  reconstruirCodigo } from './support/invitaciones-fase-2';

describe('M1-T128 regresión de autenticación compatible', () => {
  it('activa una invitación sin cuenta incompleta y conserva sesiones y límites de rol', async () => {
    await conBaseMigrada(async (db) => {
      const fixture = await prepararInvitacion(db);
      const reloj = new RelojPrueba(fixture.activar.ahora);
      const modulo = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(DataSource).useValue(db)
        .overrideProvider(RELOJ).useValue(reloj)
        .overrideProvider(CodigosService).useValue(new CodigosService(
          new AuditoriaService(), derivadorPrueba))
        .compile();
      const app = modulo.createNestApplication();
      app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true,
        forbidNonWhitelisted: true }));
      try {
        await app.init();
        const http = app.getHttpServer();
        // La invitación pendiente reserva el correo sin crear una cuenta incompleta.
        expect(await db.getRepository(Usuario).countBy({ negocioId: fixture.alta.negocioId }))
          .toBe(0);
        await request(http).post('/auth/login')
          .send({ email: fixture.activar.correo, password: passwordPrueba }).expect(401);
        const { ahora: _ahora, ...activacion } = fixture.activar;
        const activado = await request(http).post('/auth/activar-administrador')
          .send(activacion).expect(200);
        expect(activado.body).toMatchObject({ negocioId: fixture.alta.negocioId,
          email: fixture.activar.correo });
        expect(JSON.stringify(activado.body)).not.toMatch(/codigo|password|hash/i);
        const login = await request(http).post('/auth/login')
          .send({ email: fixture.activar.correo, password: passwordPrueba }).expect(200);
        const token = login.body.accessToken;
        await request(http).get('/auth/profile').auth(token, { type: 'bearer' }).expect(200);
        const sesion = await app.get(SesionesService).crear(fixture.actor.id, reloj.ahora());
        const superToken = app.get(JwtService).sign({ sub: fixture.actor.id,
          sesionId: sesion.id, rol: fixture.actor.rol, negocioId: null });
        const profesional = await request(http).post('/profesionales')
          .auth(token, { type: 'bearer' })
          .send({ nombre: 'Profesional', correo: 'prof-t128@example.test',
            password: 'Clave-profesional-123' }).expect(201);
        await request(http).post(`/auth/administradores/${profesional.body.usuarioId}/autorizar-recuperacion`)
          .auth(superToken, { type: 'bearer' }).send({}).expect(404);
        const autorizacion = await request(http)
          .post(`/auth/administradores/${activado.body.id}/autorizar-recuperacion`)
          .auth(superToken, { type: 'bearer' }).send({}).expect(201);
        expect(autorizacion.body).not.toHaveProperty('codigo');
        const codigo = await reconstruirCodigo(db);
        await request(http).post('/auth/recuperar-contrasena')
          .send({ codigo, password: 'Password-nueva-t128' }).expect(204);
        await request(http).get('/auth/profile').auth(token, { type: 'bearer' }).expect(401);
        await request(http).post('/auth/login')
          .send({ email: fixture.activar.correo, password: passwordPrueba }).expect(401);
        // Login y códigos comparten cuota por IP; avanzar la ventana antes del acceso nuevo.
        reloj.avanzar(60_000);
        await request(http).post('/auth/login')
          .send({ email: fixture.activar.correo, password: 'Password-nueva-t128' }).expect(200);
        await request(http).post('/auth/activar-recepcionista')
          .send({ codigo: 'retirado', nombre: 'Recepción', password: passwordPrueba }).expect(404);
      } finally { await app.close(); }
    });
  });
});
