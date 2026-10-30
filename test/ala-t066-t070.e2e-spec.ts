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
import { Personal } from '../src/profesionales/entities/personal.entity';
import { PersonalServicio } from '../src/profesionales/entities/personal-servicio.entity';
import { PersonalSucursal } from '../src/profesionales/entities/personal-sucursal.entity';
import { Servicio } from '../src/servicios/entities/servicio.entity';
import { Sucursal } from '../src/sucursales/entities/sucursal.entity';
import { Usuario } from '../src/usuarios/entities/usuario.entity';
import { conBaseMigrada } from './support/mariadb';
import { RelojPrueba } from './support/reloj';

describe('ALA-T066–T070: restauración y consultas separadas', () => {
  it('restaura cuatro recursos inactivos y nunca desactiva una activación posterior', async () => {
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
          const negocio = await db.getRepository(Negocio).save({ nombre: 'Restauración',
            slug: `restauracion-${randomUUID()}`, emailContacto: `${randomUUID()}@example.test`,
            activadoEn: ahora, limiteSucursalesActivas: 2 });
          await db.getRepository(Licencia).save({ negocioId: negocio.id, habilitadaEn: ahora,
            venceEn: new Date(ahora.getTime() + 90 * 86_400_000), suspendidaEn: null });
          return negocio;
        };
        const negocio = await crearNegocio();
        const otro = await crearNegocio();
        const crearCuenta = async (rol: Rol, negocioId: number) => {
          const usuario = await db.getRepository(Usuario).save({ negocioId,
            nombre: `${rol} ${randomUUID()}`, email: `${randomUUID()}@example.test`,
            passwordHash: 'hash', rol, activo: true, creadoEn: ahora, activadoEn: ahora });
          const sesion = await app.get(SesionesService).crear(usuario.id, ahora);
          const token = app.get(JwtService).sign({ sub: usuario.id, sesionId: sesion.id,
            rol, negocioId, email: usuario.email, nombre: usuario.nombre });
          return { usuario, token };
        };
        const admin = await crearCuenta(Rol.ADMIN_NEGOCIO, negocio.id);
        const ajeno = await crearCuenta(Rol.ADMIN_NEGOCIO, otro.id);
        const rolAjeno = await crearCuenta(Rol.PROFESIONAL, otro.id);
        const profesional = await crearCuenta(Rol.PROFESIONAL, negocio.id);
        const recepcionista = await crearCuenta(Rol.RECEPCIONISTA, negocio.id);
        await db.getRepository(Personal).save({ id: profesional.usuario.id,
          negocioId: negocio.id, especialidad: 'General' });
        const servicio = await db.getRepository(Servicio).save({ negocioId: negocio.id,
          nombre: `Servicio ${randomUUID()}`, costo: '100.00', duracionMinutos: 30,
          activo: true, descripcion: null, creadorPersonalId: null });
        const sucursal = await db.getRepository(Sucursal).save({ negocioId: negocio.id,
          nombre: `Sucursal ${randomUUID()}`, direccion: 'Calle 1', telefono: '6141234567',
          zonaHoraria: 'America/Chihuahua', activo: true });
        await db.getRepository(PersonalSucursal).save({ negocioId: negocio.id,
          personalId: profesional.usuario.id, sucursalId: sucursal.id, activo: true });
        await db.getRepository(PersonalServicio).save({ negocioId: negocio.id,
          personalId: profesional.usuario.id, servicioId: servicio.id, activo: true });
        const servidor = app.getHttpServer();
        const recursos = [
          { ruta: 'sucursales', id: sucursal.id, repo: Sucursal, accion: 'sucursal_restaurada' },
          { ruta: 'servicios', id: servicio.id, repo: Servicio, accion: 'servicio_restaurado' },
          { ruta: 'profesionales', id: profesional.usuario.id, repo: Usuario,
            accion: 'profesional_restaurado' },
          { ruta: 'recepcionistas', id: recepcionista.usuario.id, repo: Usuario,
            accion: 'recepcionista_restaurado' },
        ] as const;
        for (const { ruta, id, repo, accion } of recursos) {
          const base = `/${ruta}/${id}`;
          // Ningún cliente puede cambiar el negocio o el estado desde el cuerpo.
          await request(servidor).post(`${base}/inhabilitar`)
            .auth(admin.token, { type: 'bearer' }).send({ negocioId: otro.id }).expect(400);
          await request(servidor).post(`${base}/inhabilitar`)
            .auth(admin.token, { type: 'bearer' }).send({}).expect(200);
          expect((await request(servidor).get(`/${ruta}`)
            .auth(admin.token, { type: 'bearer' }).expect(200)).body)
            .not.toEqual(expect.arrayContaining([expect.objectContaining({ id })]));
          expect((await request(servidor).get(`/${ruta}/inhabilitados`)
            .auth(admin.token, { type: 'bearer' }).expect(200)).body)
            .toEqual(expect.arrayContaining([expect.objectContaining({ id })]));
          await request(servidor).get(`/${ruta}/inhabilitados`)
            .auth(rolAjeno.token, { type: 'bearer' }).expect(403);
          await request(servidor).get(`/${ruta}/inhabilitados/${id}`)
            .auth(ajeno.token, { type: 'bearer' }).expect(404);
          await request(servidor).post(`${base}/restaurar`)
            .auth(ajeno.token, { type: 'bearer' }).send({}).expect(404);
          await request(servidor).post(`${base}/restaurar`)
            .auth(rolAjeno.token, { type: 'bearer' }).send({}).expect(403);
          await request(servidor).post(`${base}/restaurar`)
            .auth(admin.token, { type: 'bearer' }).send({ negocioId: otro.id }).expect(400);
          const restaurada = await request(servidor).post(`${base}/restaurar`)
            .auth(admin.token, { type: 'bearer' }).send({}).expect(200);
          expect(restaurada.body).toMatchObject({ id, activo: false, inhabilitadoEn: null });
          expect(restaurada.body).not.toHaveProperty('passwordHash');
          expect(await db.getRepository(repo).findOneByOrFail({ id }))
            .toMatchObject({ activo: false, inhabilitadoEn: null });
          if (ruta === 'sucursales') {
            // Restaurar la sede no cambia estados individuales y activar aún valida cupo.
            expect((await db.getRepository(Usuario).findOneByOrFail({
              id: profesional.usuario.id })).activo).toBe(true);
            expect((await db.getRepository(Servicio).findOneByOrFail({ id: servicio.id })).activo)
              .toBe(true);
            await db.getRepository(Sucursal).save({ negocioId: negocio.id,
              nombre: `Otra ${randomUUID()}`, direccion: 'Calle 2', telefono: '6141234567',
              zonaHoraria: 'America/Chihuahua', activo: true });
            await db.getRepository(Negocio).update(negocio.id, { limiteSucursalesActivas: 1 });
            await request(servidor).post(`${base}/reactivar`)
              .auth(admin.token, { type: 'bearer' }).send({}).expect(409);
            await db.getRepository(Negocio).update(negocio.id, { limiteSucursalesActivas: 2 });
          }
          expect((await request(servidor).get(`/${ruta}`)
            .auth(admin.token, { type: 'bearer' }).expect(200)).body)
            .toEqual(expect.arrayContaining([expect.objectContaining({ id, activo: false })]));
          await request(servidor).get(`/${ruta}/inhabilitados/${id}`)
            .auth(admin.token, { type: 'bearer' }).expect(404);
          // Restaurar de nuevo no escribe ni altera el estado.
          const repetida = await request(servidor).post(`${base}/restaurar`)
            .auth(admin.token, { type: 'bearer' }).send({}).expect(200);
          expect(repetida.body).toMatchObject({ id, activo: false, inhabilitadoEn: null });
          expect(await db.getRepository(EventoAuditoria).countBy({ negocioId: negocio.id,
            accion })).toBe(1);
          await request(servidor).post(`${base}/reactivar`)
            .auth(admin.token, { type: 'bearer' }).send({}).expect(204);
          const posterior = await request(servidor).post(`${base}/restaurar`)
            .auth(admin.token, { type: 'bearer' }).send({}).expect(200);
          expect(posterior.body).toMatchObject({ id, activo: true, inhabilitadoEn: null });
          expect(await db.getRepository(repo).findOneByOrFail({ id }))
            .toMatchObject({ activo: true, inhabilitadoEn: null });
          expect(await db.getRepository(EventoAuditoria).countBy({ negocioId: negocio.id,
            accion })).toBe(1);
        }
        // La sede restaurada no activó por sí misma al Profesional ni al servicio.
        expect(await db.getRepository(PersonalSucursal).countBy({ personalId: profesional.usuario.id,
          sucursalId: sucursal.id, activo: true })).toBe(1);
        expect(await db.getRepository(PersonalServicio).countBy({ personalId: profesional.usuario.id,
          servicioId: servicio.id, activo: true })).toBe(1);
      } finally { await app.close(); }
    });
  });
});
