import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { Rol } from '../src/auth/enums/rol.enum';
import { SesionesService } from '../src/auth/services/sesiones.service';
import { RELOJ } from '../src/comun/reloj';
import { Licencia } from '../src/licencias/entities/licencia.entity';
import { Negocio } from '../src/negocios/entities/negocio.entity';
import { PersonalServicioSucursal } from '../src/profesionales/entities/personal-servicio-sucursal.entity';
import { ProfesionalesService } from '../src/profesionales/profesionales.service';
import { Servicio } from '../src/servicios/entities/servicio.entity';
import { Sucursal } from '../src/sucursales/entities/sucursal.entity';
import { Usuario } from '../src/usuarios/entities/usuario.entity';
import { conBaseMigrada } from './support/mariadb';
import { RelojPrueba } from './support/reloj';

async function escenario(ejecutar: (app: INestApplication, db: DataSource,
  datos: Awaited<ReturnType<typeof preparar>>) => Promise<void>) {
  await conBaseMigrada(async (db) => {
    const reloj = new RelojPrueba(new Date(Date.now() + 120000));
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DataSource).useValue(db).overrideProvider(RELOJ).useValue(reloj).compile();
    const app = modulo.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true,
      forbidNonWhitelisted: true }));
    try {
      await app.init();
      await ejecutar(app, db, await preparar(app, db, reloj));
    } finally { await app.close(); }
  });
}

async function preparar(app: INestApplication, db: DataSource, reloj: RelojPrueba) {
  // El contrato HTTP se prueba con sesiones, licencia y dos negocios migrados reales.
  const negocios = [];
  const administradores = [];
  for (const letra of ['a', 'b']) {
    const negocio = await db.getRepository(Negocio).save({ nombre: `Negocio ${letra}`,
      slug: `fix-atencion-${letra}`, emailContacto: `fix-atencion-${letra}@example.test`,
      activadoEn: reloj.ahora(), limiteSucursalesActivas: 3 });
    await db.getRepository(Licencia).save({ negocioId: negocio.id,
      habilitadaEn: reloj.ahora(), venceEn: new Date(reloj.ahora().getTime() + 365 * 86400000),
      suspendidaEn: null });
    negocios.push(negocio);
    administradores.push(await db.getRepository(Usuario).save({ negocioId: negocio.id,
      nombre: `Admin ${letra}`, email: `admin-fix-atencion-${letra}@example.test`,
      passwordHash: 'hash', rol: Rol.ADMIN_NEGOCIO, activo: true,
      creadoEn: reloj.ahora(), activadoEn: reloj.ahora() }));
  }
  const [negocio, ajeno] = negocios;
  const [admin, adminAjeno] = administradores;
  const recepcionista = await db.getRepository(Usuario).save({ negocioId: negocio.id,
    nombre: 'Recepción', email: 'recepcion-fix-atencion@example.test', passwordHash: 'hash',
    rol: Rol.RECEPCIONISTA, activo: true, creadoEn: reloj.ahora(), activadoEn: reloj.ahora() });
  const servicio = app.get(ProfesionalesService);
  const ana = await servicio.crear(admin.id, { nombre: 'Ana',
    correo: 'ana-fix-atencion@example.test', password: 'Clave-profesional-123',
    especialidad: 'Estilismo' }, reloj.ahora());
  const bea = await servicio.crear(admin.id, { nombre: 'Bea',
    correo: 'bea-fix-atencion@example.test', password: 'Clave-profesional-123',
    especialidad: 'Estilismo' }, reloj.ahora());
  const sucursales = await db.getRepository(Sucursal).save(['Centro', 'Norte', 'Libre'].map(
    (nombre) => ({ negocioId: negocio.id, nombre, direccion: 'Calle Uno',
      telefono: '6141234567', zonaHoraria: 'America/Chihuahua', activo: true })));
  const sucursalAjena = await db.getRepository(Sucursal).save({ negocioId: ajeno.id,
    nombre: 'Ajena', direccion: 'Calle Dos', telefono: '6141234567',
    zonaHoraria: 'America/Chihuahua', activo: true });
  const servicios = await db.getRepository(Servicio).save(['Corte', 'Tinte', 'Peinado'].map(
    (nombre) => ({ negocioId: negocio.id, nombre, costo: '10.00',
      duracionMinutos: 30, activo: true })));
  const servicioAjeno = await db.getRepository(Servicio).save({ negocioId: ajeno.id,
    nombre: 'Ajeno', costo: '10.00', duracionMinutos: 30, activo: true });
  await servicio.asignarSucursales(admin.id, ana.id,
    { sucursalIds: [sucursales[0].id, sucursales[1].id] });
  await servicio.asignarSucursales(admin.id, bea.id, { sucursalIds: [sucursales[0].id] });
  await servicio.seleccionarServicios(admin.id, ana.id,
    { servicioIds: [servicios[0].id, servicios[1].id] });
  await servicio.seleccionarServicios(admin.id, bea.id, { servicioIds: [servicios[0].id] });
  const tokens = new Map<number, string>();
  for (const usuario of [admin, adminAjeno, recepcionista,
    await db.getRepository(Usuario).findOneByOrFail({ id: ana.id }),
    await db.getRepository(Usuario).findOneByOrFail({ id: bea.id })]) {
    const sesion = await app.get(SesionesService).crear(usuario.id, reloj.ahora());
    tokens.set(usuario.id, app.get(JwtService).sign({ sub: usuario.id, sesionId: sesion.id,
      rol: usuario.rol, negocioId: usuario.negocioId }));
  }
  return { negocio, admin, adminAjeno, recepcionista, ana, bea, sucursales,
    sucursalAjena, servicios, servicioAjeno, tokens };
}

describe('FIX-T024–T029: rutas de atención y servicios por sucursal', () => {
  it('apaga y recupera atención propia sin tocar estado global, cupo, horario ni preferencias', async () => {
    await escenario(async (app, db, d) => {
      const http = app.getHttpServer();
      const sucursal = d.sucursales[0];
      const ruta = `/profesionales/${d.ana.id}/sucursales/${sucursal.id}/atencion`;
      await request(http).put(ruta).auth(d.tokens.get(d.admin.id)!, { type: 'bearer' })
        .send({ activo: false }).expect(200);
      expect((await request(http).get(ruta).auth(d.tokens.get(d.ana.id)!,
        { type: 'bearer' }).expect(200)).body).toEqual({ sucursalId: sucursal.id, activo: false });
      expect(await db.getRepository(Sucursal).findOneByOrFail({ id: sucursal.id }))
        .toMatchObject({ activo: true });
      expect(await db.getRepository(PersonalServicioSucursal).countBy({
        negocioId: d.negocio.id, personalId: d.ana.id, sucursalId: sucursal.id,
        activo: true })).toBe(2);
      expect((await app.get(ProfesionalesService).ofertaSucursal(d.admin.id, sucursal.id))
        .map((s) => s.id)).toEqual([d.servicios[0].id]);
      await request(http).put(ruta).auth(d.tokens.get(d.ana.id)!, { type: 'bearer' })
        .send({ activo: true }).expect(200);
      expect((await request(http).get(ruta).auth(d.tokens.get(d.admin.id)!,
        { type: 'bearer' }).expect(200)).body.activo).toBe(true);
    });
  });

  it('valida cuerpo, permisos, perfil propio y asignación antes de cambiar atención', async () => {
    await escenario(async (app, db, d) => {
      const http = app.getHttpServer();
      const ruta = `/profesionales/${d.ana.id}/sucursales/${d.sucursales[0].id}/atencion`;
      for (const cuerpo of [{}, { activo: 'false' }, { activo: 1 },
        { activo: false, extra: true }]) {
        await request(http).put(ruta).auth(d.tokens.get(d.admin.id)!, { type: 'bearer' })
          .send(cuerpo).expect(400);
      }
      await request(http).put(ruta).auth(d.tokens.get(d.recepcionista.id)!,
        { type: 'bearer' }).send({ activo: false }).expect(403);
      await request(http).put(ruta).auth(d.tokens.get(d.bea.id)!,
        { type: 'bearer' }).send({ activo: false }).expect(403);
      await request(http).put(ruta).auth(d.tokens.get(d.adminAjeno.id)!,
        { type: 'bearer' }).send({ activo: false }).expect(404);
      for (const sucursalId of [d.sucursales[2].id, d.sucursalAjena.id]) {
        await request(http).put(`/profesionales/${d.ana.id}/sucursales/${sucursalId}/atencion`)
          .auth(d.tokens.get(d.admin.id)!, { type: 'bearer' })
          .send({ activo: false }).expect(404);
      }
      await request(http).post(`/sucursales/${d.sucursales[0].id}/desactivar`)
        .auth(d.tokens.get(d.ana.id)!, { type: 'bearer' }).send({}).expect(403);
      expect((await request(http).get(ruta).auth(d.tokens.get(d.admin.id)!,
        { type: 'bearer' }).expect(200)).body.activo).toBe(true);
      expect(await db.getRepository(Sucursal).findOneByOrFail({ id: d.sucursales[0].id }))
        .toMatchObject({ activo: true });
    });
  });

  it('reemplaza oferta por sucursal con [], preserva otra sucursal y rechaza IDs inválidos', async () => {
    await escenario(async (app, db, d) => {
      const http = app.getHttpServer();
      const [centro, norte] = d.sucursales;
      const [corte, tinte, peinado] = d.servicios;
      const ruta = `/profesionales/${d.ana.id}/sucursales/${centro.id}/servicios`;
      const norteRuta = `/profesionales/${d.ana.id}/sucursales/${norte.id}/servicios`;
      expect((await request(http).get(ruta).auth(d.tokens.get(d.ana.id)!,
        { type: 'bearer' }).expect(200)).body).toEqual({ sucursalId: centro.id,
        servicioIds: [corte.id, tinte.id] });
      await request(http).put(ruta).auth(d.tokens.get(d.ana.id)!, { type: 'bearer' })
        .send({ servicioIds: [] }).expect(200);
      expect((await request(http).get(ruta).auth(d.tokens.get(d.admin.id)!,
        { type: 'bearer' }).expect(200)).body.servicioIds).toEqual([]);
      expect((await request(http).get(norteRuta).auth(d.tokens.get(d.admin.id)!,
        { type: 'bearer' }).expect(200)).body.servicioIds).toEqual([corte.id, tinte.id]);
      await request(http).put(ruta).auth(d.tokens.get(d.admin.id)!, { type: 'bearer' })
        .send({ servicioIds: [tinte.id] }).expect(200);
      const auditoriaAntes = Number((await db.query(`SELECT COUNT(*) total
        FROM eventos_auditoria WHERE negocio_id = ? AND recurso_id = ?
          AND accion = 'profesional_servicios_sucursal_modificados'`,
      [d.negocio.id, d.ana.id]))[0].total);
      // Repetir el mismo conjunto no cambia filas ni produce otro evento.
      await request(http).put(ruta).auth(d.tokens.get(d.admin.id)!, { type: 'bearer' })
        .send({ servicioIds: [tinte.id] }).expect(200);
      expect(Number((await db.query(`SELECT COUNT(*) total FROM eventos_auditoria
        WHERE negocio_id = ? AND recurso_id = ?
          AND accion = 'profesional_servicios_sucursal_modificados'`,
      [d.negocio.id, d.ana.id]))[0].total)).toBe(auditoriaAntes);
      for (const [ids, estado] of [
        [[tinte.id, tinte.id], 400], [[peinado.id], 409],
        [[d.servicioAjeno.id], 404],
      ] as [number[], number][]) {
        await request(http).put(ruta).auth(d.tokens.get(d.admin.id)!, { type: 'bearer' })
          .send({ servicioIds: ids }).expect(estado);
      }
      await request(http).put(`/profesionales/${d.ana.id}/sucursales/${d.sucursales[2].id}/servicios`)
        .auth(d.tokens.get(d.admin.id)!, { type: 'bearer' })
        .send({ servicioIds: [corte.id] }).expect(404);
      await request(http).put(ruta).auth(d.tokens.get(d.bea.id)!, { type: 'bearer' })
        .send({ servicioIds: [corte.id] }).expect(403);
      await request(http).get(ruta).auth(d.tokens.get(d.bea.id)!,
        { type: 'bearer' }).expect(403);
      await request(http).put(ruta).auth(d.tokens.get(d.adminAjeno.id)!,
        { type: 'bearer' }).send({ servicioIds: [corte.id] }).expect(404);
      await request(http).put(ruta).auth(d.tokens.get(d.recepcionista.id)!,
        { type: 'bearer' }).send({ servicioIds: [corte.id] }).expect(403);
      expect((await request(http).get(ruta).auth(d.tokens.get(d.admin.id)!,
        { type: 'bearer' }).expect(200)).body.servicioIds).toEqual([tinte.id]);
      expect(await db.getRepository(PersonalServicioSucursal).countBy({ negocioId: d.negocio.id,
        personalId: d.ana.id, sucursalId: centro.id })).toBe(2);
      expect((await request(http).get(norteRuta).auth(d.tokens.get(d.admin.id)!,
        { type: 'bearer' }).expect(200)).body.servicioIds).toEqual([corte.id, tinte.id]);
    });
  });
});
