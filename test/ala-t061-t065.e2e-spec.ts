import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource, IsNull } from 'typeorm';
import { AppModule } from '../src/app.module';
import { CorreoAcceso } from '../src/altas/entities/correo-acceso.entity';
import { EventoAuditoria } from '../src/auditoria/entities/evento-auditoria.entity';
import { Rol } from '../src/auth/enums/rol.enum';
import { Sesion } from '../src/auth/entities/sesion.entity';
import { SesionesService } from '../src/auth/services/sesiones.service';
import { PoliticaContrasenasService } from '../src/auth/services/politica-contrasenas.service';
import { RELOJ } from '../src/comun/reloj';
import { HorarioPersonal } from '../src/horarios/entities/horario-personal.entity';
import { Licencia } from '../src/licencias/entities/licencia.entity';
import { Negocio } from '../src/negocios/entities/negocio.entity';
import { Personal } from '../src/profesionales/entities/personal.entity';
import { PersonalServicio } from '../src/profesionales/entities/personal-servicio.entity';
import { PersonalSucursal } from '../src/profesionales/entities/personal-sucursal.entity';
import { PersonalServicioSucursal } from '../src/profesionales/entities/personal-servicio-sucursal.entity';
import { Servicio } from '../src/servicios/entities/servicio.entity';
import { Sucursal } from '../src/sucursales/entities/sucursal.entity';
import { Usuario } from '../src/usuarios/entities/usuario.entity';
import { conBaseMigrada } from './support/mariadb';
import { RelojPrueba } from './support/reloj';

describe('ALA-T061–T065: inhabilitación recuperable y acceso', () => {
  it('conserva las cuatro filas, separa listados, no duplica eventos y bloquea sesiones', async () => {
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
          const negocio = await db.getRepository(Negocio).save({ nombre: 'Inhabilitación',
            slug: `inhabilitacion-${randomUUID()}`, emailContacto: `${randomUUID()}@example.test`,
            activadoEn: ahora });
          await db.getRepository(Licencia).save({ negocioId: negocio.id, habilitadaEn: ahora,
            venceEn: new Date(ahora.getTime() + 90 * 86_400_000), suspendidaEn: null });
          return negocio;
        };
        const negocio = await crearNegocio();
        const otro = await crearNegocio();
        const crearUsuario = async (rol: Rol, negocioId: number) => {
          const usuario = await db.getRepository(Usuario).save({ negocioId,
            nombre: `${rol} ${randomUUID()}`, email: `${randomUUID()}@example.test`,
            passwordHash: 'hash', rol, activo: true, creadoEn: ahora, activadoEn: ahora });
          const sesion = await app.get(SesionesService).crear(usuario.id, ahora);
          return { usuario, token: app.get(JwtService).sign({ sub: usuario.id,
            sesionId: sesion.id, rol, negocioId, email: usuario.email,
            nombre: usuario.nombre }), sesion };
        };
        const admin = await crearUsuario(Rol.ADMIN_NEGOCIO, negocio.id);
        const adminAjeno = await crearUsuario(Rol.ADMIN_NEGOCIO, otro.id);
        const profesionalAjeno = await crearUsuario(Rol.PROFESIONAL, otro.id);
        const profesional = await crearUsuario(Rol.PROFESIONAL, negocio.id);
        await db.getRepository(Personal).save({ id: profesional.usuario.id,
          negocioId: negocio.id, especialidad: 'General' });
        const recepcionista = await crearUsuario(Rol.RECEPCIONISTA, negocio.id);
        const clave = 'Clave-inhabilitacion-123';
        const passwordHash = await app.get(PoliticaContrasenasService).generarHash(clave);
        await db.getRepository(Usuario).update({ id: profesional.usuario.id }, { passwordHash });
        await db.getRepository(Usuario).update({ id: recepcionista.usuario.id }, { passwordHash });
        const servicio = await db.getRepository(Servicio).save({ negocioId: negocio.id,
          nombre: `Servicio ${randomUUID()}`, costo: '100.00', duracionMinutos: 30,
          activo: true, descripcion: null, creadorPersonalId: null });
        const sucursal = await db.getRepository(Sucursal).save({ negocioId: negocio.id,
          nombre: `Sucursal ${randomUUID()}`, direccion: 'Calle 1', telefono: '6141234567',
          zonaHoraria: 'America/Chihuahua', activo: true });
        await db.getRepository(CorreoAcceso).save([
          { usuarioId: profesional.usuario.id, correo: profesional.usuario.email },
          { usuarioId: recepcionista.usuario.id, correo: recepcionista.usuario.email },
        ]);
        // Las selecciones quedan intactas aunque se retire cualquiera de sus tres extremos.
        await db.getRepository(PersonalSucursal).save({ negocioId: negocio.id,
          personalId: profesional.usuario.id, sucursalId: sucursal.id, activo: true });
        await db.getRepository(PersonalServicio).save({ negocioId: negocio.id,
          personalId: profesional.usuario.id, servicioId: servicio.id, activo: true });
        await db.getRepository(PersonalServicioSucursal).save({ negocioId: negocio.id,
          personalId: profesional.usuario.id, sucursalId: sucursal.id,
          servicioId: servicio.id, activo: true });
        const horario = await db.getRepository(HorarioPersonal).save({ negocioId: negocio.id,
          personalId: profesional.usuario.id, sucursalId: sucursal.id, diaSemana: 1,
          orden: 0, inicioMinutos: 540, finMinutos: 1020, activo: true });
        const servidor = app.getHttpServer();
        for (const cuenta of [profesional, recepcionista]) {
          await request(servidor).post('/auth/login')
            .send({ email: cuenta.usuario.email, password: clave }).expect(200);
        }
        const recursos = [
          { ruta: 'sucursales', id: sucursal.id, repo: Sucursal },
          { ruta: 'servicios', id: servicio.id, repo: Servicio },
          { ruta: 'profesionales', id: profesional.usuario.id, repo: Usuario },
          { ruta: 'recepcionistas', id: recepcionista.usuario.id, repo: Usuario },
        ] as const;
        for (const { ruta, id, repo } of recursos) {
          const base = `/${ruta}/${id}`;
          await request(servidor).post(`${base}/inhabilitar`)
            .auth(adminAjeno.token, { type: 'bearer' }).send({}).expect(404);
          await request(servidor).post(`${base}/inhabilitar`)
            .auth(profesionalAjeno.token, { type: 'bearer' }).send({}).expect(403);
          await request(servidor).post(`${base}/inhabilitar`)
            .auth(admin.token, { type: 'bearer' }).send({}).expect(200);
          await request(servidor).post(`${base}/inhabilitar`)
            .auth(admin.token, { type: 'bearer' }).send({}).expect(200);
          const fila = await db.getRepository(repo).findOneByOrFail({ id });
          expect(fila).toMatchObject({ activo: false,
            inhabilitadoEn: ahora });
          if (ruta === 'sucursales') {
            // Retirar una sede no propaga estados a sus recursos vinculados.
            expect((await db.getRepository(Usuario).findOneByOrFail({ id: profesional.usuario.id })).activo).toBe(true);
            expect((await db.getRepository(Servicio).findOneByOrFail({ id: servicio.id })).activo).toBe(true);
          }
          expect((await request(servidor).get(`/${ruta}`)
            .auth(admin.token, { type: 'bearer' }).expect(200)).body)
            .not.toEqual(expect.arrayContaining([expect.objectContaining({ id })]));
          expect((await request(servidor).get(`/${ruta}/inhabilitados/${id}`)
            .auth(admin.token, { type: 'bearer' }).expect(200)).body)
            .toMatchObject({ id, activo: false });
          await request(servidor).get(base).auth(admin.token, { type: 'bearer' }).expect(404);
          await request(servidor).get(`/${ruta}/inhabilitados/${id}`)
            .auth(adminAjeno.token, { type: 'bearer' }).expect(404);
          await request(servidor).delete(base).auth(admin.token, { type: 'bearer' }).expect(404);
          expect(await db.getRepository(EventoAuditoria).count({ where: {
            negocioId: negocio.id, accion: `${ruta === 'profesionales' ? 'profesional' : ruta === 'recepcionistas' ? 'recepcionista' : ruta === 'servicios' ? 'servicio' : 'sucursal'}_inhabilitad${ruta === 'sucursales' ? 'a' : 'o'}`,
          } })).toBe(1);
        }
        expect(await db.getRepository(Personal).countBy({ id: profesional.usuario.id })).toBe(1);
        expect(await db.getRepository(CorreoAcceso).countBy({ usuarioId: profesional.usuario.id })).toBe(1);
        expect(await db.getRepository(CorreoAcceso).countBy({ usuarioId: recepcionista.usuario.id })).toBe(1);
        expect(await db.getRepository(PersonalSucursal).countBy({ personalId: profesional.usuario.id })).toBe(1);
        expect(await db.getRepository(PersonalServicio).countBy({ personalId: profesional.usuario.id })).toBe(1);
        expect(await db.getRepository(PersonalServicioSucursal).countBy({ personalId: profesional.usuario.id })).toBe(1);
        expect(await db.getRepository(HorarioPersonal).findOneByOrFail({ id: horario.id }))
          .toMatchObject({ sucursalId: sucursal.id, activo: true });
        expect((await db.getRepository(Servicio).findOneByOrFail({ id: servicio.id })))
          .toMatchObject({ nombre: servicio.nombre, costo: servicio.costo });
        expect((await request(servidor).get('/profesionales/cupo')
          .auth(admin.token, { type: 'bearer' }).expect(200)).body.activos).toBe(0);
        expect((await request(servidor).get('/recepcionistas/cupo')
          .auth(admin.token, { type: 'bearer' }).expect(200)).body.activos).toBe(0);
        await request(servidor).post(`/profesionales/${profesional.usuario.id}/reactivar`)
          .auth(admin.token, { type: 'bearer' }).send({}).expect(409);
        await request(servidor).post(`/recepcionistas/${recepcionista.usuario.id}/reactivar`)
          .auth(admin.token, { type: 'bearer' }).send({}).expect(409);
        await request(servidor).post(`/servicios/${servicio.id}/reactivar`)
          .auth(admin.token, { type: 'bearer' }).send({}).expect(409);
        await request(servidor).post(`/sucursales/${sucursal.id}/reactivar`)
          .auth(admin.token, { type: 'bearer' }).send({}).expect(409);
        // La sesión emitida antes de la baja y una contraseña aún válida no conceden acceso.
        for (const cuenta of [profesional, recepcionista]) {
          expect((await db.getRepository(Sesion).findOneByOrFail({ id: cuenta.sesion.id }))
            .revocadaEn).toEqual(ahora);
          expect(await db.getRepository(Sesion).countBy({ usuarioId: cuenta.usuario.id,
            revocadaEn: IsNull() })).toBe(0);
          await request(servidor).get('/auth/profile')
            .auth(cuenta.token, { type: 'bearer' }).expect(401);
          await request(servidor).post('/auth/login')
            .send({ email: cuenta.usuario.email, password: clave }).expect(401);
          expect((await db.getRepository(Usuario).findOneByOrFail({ id: cuenta.usuario.id }))
            .passwordHash).toBe(passwordHash);
          expect((await db.getRepository(Usuario).findOneByOrFail({ id: cuenta.usuario.id }))
            .inhabilitadoEn).toEqual(expect.any(Date));
        }
      } finally { await app.close(); }
    });
  });
});
