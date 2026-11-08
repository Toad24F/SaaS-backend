import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { EventoAuditoria } from '../src/auditoria/entities/evento-auditoria.entity';
import { Rol } from '../src/auth/enums/rol.enum';
import { SesionesService } from '../src/auth/services/sesiones.service';
import { RELOJ } from '../src/comun/reloj';
import { Licencia } from '../src/licencias/entities/licencia.entity';
import { Negocio } from '../src/negocios/entities/negocio.entity';
import { Servicio } from '../src/servicios/entities/servicio.entity';
import { Usuario } from '../src/usuarios/entities/usuario.entity';
import { conBaseMigrada } from './support/mariadb';
import { RelojPrueba } from './support/reloj';

describe('ALA-T075–T076: publicación global de precios', () => {
  it('acepta PATCH parcial propio, conserva contacto y audita solo cambios reales', async () => {
    await conBaseMigrada(async (db) => {
      const ahora = new Date(Date.now() + 60_000);
      const modulo = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(DataSource).useValue(db)
        .overrideProvider(RELOJ).useValue(new RelojPrueba(ahora)).compile();
      const app: INestApplication = modulo.createNestApplication();
      app.useGlobalPipes(new ValidationPipe({ whitelist: true,
        forbidNonWhitelisted: true, transform: true }));
      try {
        await app.init();
        const crearNegocio = async () => {
          const negocio = await db.getRepository(Negocio).save({ nombre: 'Precios',
            slug: `precios-${randomUUID()}`, emailContacto: `${randomUUID()}@example.test`,
            categoria: 'Salud', telefonoContacto: '6141234567',
            mostrarContactoPublico: true, activadoEn: ahora });
          await db.getRepository(Licencia).save({ negocioId: negocio.id,
            habilitadaEn: ahora, venceEn: new Date(ahora.getTime() + 90 * 86_400_000),
            suspendidaEn: null });
          return negocio;
        };
        const a = await crearNegocio();
        const b = await crearNegocio();
        const token = async (rol: Rol, negocioId: number) => {
          const usuario = await db.getRepository(Usuario).save({ negocioId,
            nombre: `${rol} ${randomUUID()}`, email: `${randomUUID()}@example.test`,
            passwordHash: 'hash', rol, activo: true, creadoEn: ahora, activadoEn: ahora });
          const sesion = await app.get(SesionesService).crear(usuario.id, ahora);
          return app.get(JwtService).sign({ sub: usuario.id, sesionId: sesion.id,
            rol, negocioId, email: usuario.email, nombre: usuario.nombre });
        };
        const adminA = await token(Rol.ADMIN_NEGOCIO, a.id);
        const adminB = await token(Rol.ADMIN_NEGOCIO, b.id);
        const recepcion = await token(Rol.RECEPCIONISTA, a.id);
        const http = app.getHttpServer();
        const ruta = '/negocios/publicacion-catalogo';
        const leer = (credencial: string) => request(http).get(ruta)
          .auth(credencial, { type: 'bearer' });
        const cambiar = (credencial: string, datos: unknown) => request(http).patch(ruta)
          .auth(credencial, { type: 'bearer' }).send(datos);
        await request(http).get(ruta).expect(401);
        await leer(recepcion).expect(403);
        expect((await leer(adminA).expect(200)).body).toMatchObject({
          categoria: 'Salud', telefono: '6141234567',
          mostrarContactoPublico: true, mostrarPreciosPublicos: true });
        await cambiar(recepcion, { mostrarPreciosPublicos: false }).expect(403);
        await cambiar(adminA, { mostrarPreciosPublicos: 'false' }).expect(400);
        await cambiar(adminA, { mostrarPreciosPublicos: false, negocioId: b.id }).expect(400);
        await cambiar(adminA, {}).expect(400);
        const oculto = await cambiar(adminA, { mostrarPreciosPublicos: false }).expect(200);
        expect(oculto.body).toMatchObject({ categoria: 'Salud', telefono: '6141234567',
          mostrarContactoPublico: true, mostrarPreciosPublicos: false });
        await cambiar(adminA, { mostrarPreciosPublicos: false }).expect(200);
        expect((await leer(adminB).expect(200)).body.mostrarPreciosPublicos).toBe(true);
        expect((await db.getRepository(Negocio).findOneByOrFail({ id: a.id })))
          .toMatchObject({ mostrarPreciosPublicos: false, categoria: 'Salud',
            telefonoContacto: '6141234567', mostrarContactoPublico: true });
        expect(await db.getRepository(EventoAuditoria).countBy({ negocioId: a.id,
          accion: 'publicacion_catalogo_modificada' })).toBe(1);
        // Los servicios creados después comparten la opción global del negocio.
        const nuevo = await request(http).post('/servicios')
          .auth(adminA, { type: 'bearer' })
          .send({ nombre: `Nuevo ${randomUUID()}`, costo: '120.00',
            duracionMinutos: 30 }).expect(201);
        expect(await db.getRepository(Servicio).findOneByOrFail({ id: nuevo.body.id }))
          .toMatchObject({ costo: '120.00', negocioId: a.id });
        expect((await leer(adminA).expect(200)).body.mostrarPreciosPublicos).toBe(false);
        await cambiar(adminA, { categoria: 'Bienestar' }).expect(200);
        expect((await leer(adminA).expect(200)).body).toMatchObject({
          categoria: 'Bienestar', telefono: '6141234567',
          mostrarContactoPublico: true, mostrarPreciosPublicos: false });
      } finally { await app.close(); }
    });
  });
});
