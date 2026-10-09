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
import { PersonalServicio } from '../src/profesionales/entities/personal-servicio.entity';
import { PersonalServicioSucursal } from '../src/profesionales/entities/personal-servicio-sucursal.entity';
import { PersonalSucursal } from '../src/profesionales/entities/personal-sucursal.entity';
import { ProfesionalesService } from '../src/profesionales/profesionales.service';
import { Servicio } from '../src/servicios/entities/servicio.entity';
import { ServiciosService } from '../src/servicios/servicios.service';
import { Sucursal } from '../src/sucursales/entities/sucursal.entity';
import { SucursalesService } from '../src/sucursales/sucursales.service';
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
  // JWT y dos negocios reales permiten probar lectura y mutación sin confiar en IDs enviados.
  const negocios = [];
  const administradores = [];
  for (const letra of ['a', 'b']) {
    const negocio = await db.getRepository(Negocio).save({ nombre: `Oferta ${letra}`,
      slug: `consulta-fix-${letra}`, emailContacto: `consulta-fix-${letra}@example.test`,
      activadoEn: reloj.ahora(), limiteSucursalesActivas: 3 });
    await db.getRepository(Licencia).save({ negocioId: negocio.id,
      habilitadaEn: reloj.ahora(), venceEn: new Date(reloj.ahora().getTime() + 365 * 86400000),
      suspendidaEn: null });
    negocios.push(negocio);
    administradores.push(await db.getRepository(Usuario).save({ negocioId: negocio.id,
      nombre: `Admin ${letra}`, email: `admin-consulta-${letra}@example.test`,
      passwordHash: 'hash', rol: Rol.ADMIN_NEGOCIO, activo: true,
      creadoEn: reloj.ahora(), activadoEn: reloj.ahora() }));
  }
  const [negocio, ajeno] = negocios;
  const [admin, adminAjeno] = administradores;
  const recepcionista = await db.getRepository(Usuario).save({ negocioId: negocio.id,
    nombre: 'Recepción', email: 'recepcion-consulta@example.test', passwordHash: 'hash',
    rol: Rol.RECEPCIONISTA, activo: true, creadoEn: reloj.ahora(), activadoEn: reloj.ahora() });
  const profesionales = app.get(ProfesionalesService);
  const ana = await profesionales.crear(admin.id, { nombre: 'Ana',
    correo: 'ana-consulta@example.test', password: 'Clave-profesional-123',
    especialidad: 'Estilismo' }, reloj.ahora());
  const bea = await profesionales.crear(admin.id, { nombre: 'Bea',
    correo: 'bea-consulta@example.test', password: 'Clave-profesional-123',
    especialidad: 'Estilismo' }, reloj.ahora());
  const sucursales = await db.getRepository(Sucursal).save(['Centro', 'Norte'].map((nombre) => ({
    negocioId: negocio.id, nombre, direccion: 'Calle Uno', telefono: '6141234567',
    zonaHoraria: 'America/Chihuahua', activo: true })));
  const servicios = await db.getRepository(Servicio).save(['Corte', 'Tinte'].map((nombre) => ({
    negocioId: negocio.id, nombre, costo: '10.00', duracionMinutos: 30, activo: true })));
  const sucursalAjena = await db.getRepository(Sucursal).save({ negocioId: ajeno.id,
    nombre: 'Ajena', direccion: 'Calle Dos', telefono: '6141234567',
    zonaHoraria: 'America/Chihuahua', activo: true });
  const servicioAjeno = await db.getRepository(Servicio).save({ negocioId: ajeno.id,
    nombre: 'Ajeno', costo: '10.00', duracionMinutos: 30, activo: true });
  await profesionales.asignarSucursales(admin.id, ana.id,
    { sucursalIds: sucursales.map((sucursal) => sucursal.id) });
  await profesionales.asignarSucursales(admin.id, bea.id,
    { sucursalIds: [sucursales[0].id] });
  await profesionales.seleccionarServicios(admin.id, ana.id,
    { servicioIds: servicios.map((servicio) => servicio.id) });
  await profesionales.seleccionarServicios(admin.id, bea.id,
    { servicioIds: [servicios[0].id] });
  const tokens = new Map<number, string>();
  for (const usuario of [admin, adminAjeno, recepcionista,
    await db.getRepository(Usuario).findOneByOrFail({ id: ana.id }),
    await db.getRepository(Usuario).findOneByOrFail({ id: bea.id })]) {
    const sesion = await app.get(SesionesService).crear(usuario.id, reloj.ahora());
    tokens.set(usuario.id, app.get(JwtService).sign({ sub: usuario.id, sesionId: sesion.id,
      rol: usuario.rol, negocioId: usuario.negocioId }));
  }
  return { negocio, admin, adminAjeno, recepcionista, ana, bea, sucursales,
    sucursalAjena, servicios, servicioAjeno, tokens, reloj };
}

type VistaServicio = { id: number; servicioActivo: boolean; seleccionGeneralActiva: boolean;
  seleccionSucursalActiva: boolean; ofrecido: boolean; motivosExclusion: string[] };
type VistaSucursal = { id: number; sucursalActiva: boolean; atencionActiva: boolean;
  servicios: VistaServicio[] };
type VistaOferta = { personalId: number; cuentaActiva: boolean; sucursales: VistaSucursal[] };

function combinacion(vista: VistaOferta, sucursalId: number, servicioId: number) {
  return vista.sucursales.find((sucursal) => sucursal.id === sucursalId)!
    .servicios.find((servicio) => servicio.id === servicioId)!;
}

describe('FIX-T030–T034: consulta explicable y acceso transversal', () => {
  it('deriva cada nivel de estado, explica exclusiones y no altera preferencias al consultar', async () => {
    await escenario(async (app, db, d) => {
      const http = app.getHttpServer();
      const profesionales = app.get(ProfesionalesService);
      const sucursales = app.get(SucursalesService);
      const servicios = app.get(ServiciosService);
      const [centro, norte] = d.sucursales;
      const [corte, tinte] = d.servicios;
      const ruta = `/profesionales/${d.ana.id}/oferta`;
      const consultar = async (): Promise<VistaOferta> => (await request(http).get(ruta)
        .auth(d.tokens.get(d.admin.id)!, { type: 'bearer' }).expect(200)).body;
      let vista = await consultar();
      expect(vista.personalId).toBe(d.ana.id);
      expect(vista.cuentaActiva).toBe(true);
      expect(vista.sucursales.map((sucursal) => sucursal.id)).toEqual([centro.id, norte.id]);
      expect(combinacion(vista, centro.id, corte.id)).toMatchObject({
        servicioActivo: true, seleccionGeneralActiva: true,
        seleccionSucursalActiva: true, ofrecido: true, motivosExclusion: [] });

      // Se apaga y recupera cada nivel por separado; el motivo debe señalar el nivel exacto.
      await profesionales.cambiarEstado(d.admin.id, d.ana.id, false, d.reloj.ahora());
      vista = await consultar();
      expect(vista.cuentaActiva).toBe(false);
      expect(combinacion(vista, centro.id, corte.id).motivosExclusion)
        .toEqual(['cuenta_inactiva']);
      await profesionales.cambiarEstado(d.admin.id, d.ana.id, true, d.reloj.ahora());

      await servicios.cambiarEstado(d.admin.id, corte.id, false);
      vista = await consultar();
      expect(combinacion(vista, centro.id, corte.id).motivosExclusion)
        .toEqual(['servicio_inactivo']);
      await servicios.cambiarEstado(d.admin.id, corte.id, true);

      await sucursales.desactivar(d.admin.id, centro.id);
      vista = await consultar();
      expect(vista.sucursales[0]).toMatchObject({ sucursalActiva: false,
        atencionActiva: true });
      expect(combinacion(vista, centro.id, corte.id).motivosExclusion)
        .toEqual(['sucursal_inactiva']);
      await sucursales.reactivar(d.admin.id, centro.id);

      await profesionales.seleccionarServicios(d.admin.id, d.ana.id,
        { servicioIds: [tinte.id] });
      vista = await consultar();
      expect(combinacion(vista, centro.id, corte.id)).toMatchObject({
        seleccionGeneralActiva: false, seleccionSucursalActiva: true,
        ofrecido: false, motivosExclusion: ['servicio_no_seleccionado'] });
      await profesionales.seleccionarServicios(d.admin.id, d.ana.id,
        { servicioIds: [corte.id, tinte.id] });

      await profesionales.cambiarAtencionSucursal(d.admin.id, d.ana.id,
        centro.id, false, d.reloj.ahora().toISOString().slice(0, 10));
      vista = await consultar();
      expect(combinacion(vista, centro.id, corte.id).motivosExclusion)
        .toEqual(['atencion_inactiva']);
      expect(combinacion(vista, norte.id, corte.id).ofrecido).toBe(true);
      await profesionales.cambiarAtencionSucursal(d.admin.id, d.ana.id,
        centro.id, true, d.reloj.ahora().toISOString().slice(0, 10));

      await profesionales.seleccionarServiciosSucursal(d.admin.id, d.ana.id,
        centro.id, { servicioIds: [tinte.id] });
      vista = await consultar();
      expect(combinacion(vista, centro.id, corte.id).motivosExclusion)
        .toEqual(['servicio_no_ofrecido_en_sucursal']);
      expect(combinacion(vista, centro.id, tinte.id).ofrecido).toBe(true);
      expect(combinacion(vista, norte.id, corte.id).ofrecido).toBe(true);
      await profesionales.seleccionarServiciosSucursal(d.admin.id, d.ana.id,
        centro.id, { servicioIds: [] });
      vista = await consultar();
      expect(vista.sucursales[0].servicios.every((servicio) => !servicio.ofrecido)).toBe(true);
      await profesionales.seleccionarServiciosSucursal(d.admin.id, d.ana.id,
        norte.id, { servicioIds: [] });
      vista = await consultar();
      expect(vista.sucursales.every((sucursal) =>
        sucursal.servicios.every((servicio) => !servicio.ofrecido))).toBe(true);

      const antes = {
        seleccion: await db.getRepository(PersonalServicio).findBy({ negocioId: d.negocio.id,
          personalId: d.ana.id }),
        asignacion: await db.getRepository(PersonalSucursal).findBy({ negocioId: d.negocio.id,
          personalId: d.ana.id }),
        oferta: await db.getRepository(PersonalServicioSucursal).findBy({ negocioId: d.negocio.id,
          personalId: d.ana.id }),
      };
      await consultar();
      expect(await db.getRepository(PersonalServicio).findBy({ negocioId: d.negocio.id,
        personalId: d.ana.id })).toEqual(antes.seleccion);
      expect(await db.getRepository(PersonalSucursal).findBy({ negocioId: d.negocio.id,
        personalId: d.ana.id })).toEqual(antes.asignacion);
      expect(await db.getRepository(PersonalServicioSucursal).findBy({ negocioId: d.negocio.id,
        personalId: d.ana.id })).toEqual(antes.oferta);

      await profesionales.seleccionarServicios(d.admin.id, d.ana.id,
        { servicioIds: [tinte.id] });
      await profesionales.cambiarAtencionSucursal(d.admin.id, d.ana.id,
        centro.id, false, d.reloj.ahora().toISOString().slice(0, 10));
      await servicios.cambiarEstado(d.admin.id, corte.id, false);
      await sucursales.desactivar(d.admin.id, centro.id);
      await profesionales.cambiarEstado(d.admin.id, d.ana.id, false, d.reloj.ahora());
      // Varias causas simultáneas se explican juntas, con orden estable y sin estado derivado guardado.
      vista = await consultar();
      expect(combinacion(vista, centro.id, corte.id).motivosExclusion).toEqual([
        'cuenta_inactiva', 'sucursal_inactiva', 'servicio_inactivo',
        'servicio_no_seleccionado', 'atencion_inactiva',
        'servicio_no_ofrecido_en_sucursal',
      ]);
    });
  });

  it('autoriza la oferta propia y mantiene cerradas todas las rutas nuevas ante roles e IDs ajenos', async () => {
    await escenario(async (app, db, d) => {
      const http = app.getHttpServer();
      const ruta = `/profesionales/${d.ana.id}/oferta`;
      await request(http).get(ruta).auth(d.tokens.get(d.ana.id)!,
        { type: 'bearer' }).expect(200);
      await request(http).get(ruta).auth(d.tokens.get(d.bea.id)!,
        { type: 'bearer' }).expect(403);
      await request(http).get(ruta).auth(d.tokens.get(d.recepcionista.id)!,
        { type: 'bearer' }).expect(403);
      await request(http).get(ruta).auth(d.tokens.get(d.adminAjeno.id)!,
        { type: 'bearer' }).expect(404);
      const centro = d.sucursales[0];
      const rutas = [
        { metodo: 'get', path: `/profesionales/${d.ana.id}/servicios` },
        { metodo: 'put', path: `/profesionales/${d.ana.id}/servicios`,
          cuerpo: { servicioIds: [d.servicios[0].id] } },
        { metodo: 'get', path: `/profesionales/${d.ana.id}/sucursales/${centro.id}/atencion` },
        { metodo: 'put', path: `/profesionales/${d.ana.id}/sucursales/${centro.id}/atencion`,
          cuerpo: { activo: false } },
        { metodo: 'get', path: `/profesionales/${d.ana.id}/sucursales/${centro.id}/servicios` },
        { metodo: 'put', path: `/profesionales/${d.ana.id}/sucursales/${centro.id}/servicios`,
          cuerpo: { servicioIds: [] } },
      ] as const;
      // Cada ruta debe aplicar la misma propiedad de perfil y el mismo aislamiento de negocio.
      for (const rutaNueva of rutas) {
        const enviar = (actorId: number) => {
          const peticion = request(http)[rutaNueva.metodo](rutaNueva.path)
            .auth(d.tokens.get(actorId)!, { type: 'bearer' });
          return 'cuerpo' in rutaNueva ? peticion.send(rutaNueva.cuerpo) : peticion;
        };
        await enviar(d.bea.id).expect(403);
        await enviar(d.recepcionista.id).expect(403);
        await enviar(d.adminAjeno.id).expect(404);
      }
      // El catálogo compartido permite crear al Profesional y editar solo al autor.
      const creado = (await request(http).post('/servicios')
        .auth(d.tokens.get(d.ana.id)!, { type: 'bearer' })
        .send({ nombre: 'Diseño', costo: '15.00', duracionMinutos: 40,
          descripcion: 'Diseño personalizado' }).expect(201)).body;
      expect(creado).toMatchObject({ negocioId: d.negocio.id,
        creadorPersonalId: d.ana.id, descripcion: 'Diseño personalizado' });
      expect(await db.getRepository(PersonalServicioSucursal).countBy({ negocioId: d.negocio.id,
        personalId: d.ana.id, servicioId: creado.id })).toBe(2);
      expect(await db.getRepository(PersonalServicioSucursal).countBy({ negocioId: d.negocio.id,
        personalId: d.bea.id, servicioId: creado.id })).toBe(0);
      await request(http).patch(`/servicios/${creado.id}`)
        .auth(d.tokens.get(d.bea.id)!, { type: 'bearer' })
        .send({ nombre: 'Ajeno' }).expect(403);
      await request(http).patch(`/servicios/${creado.id}`)
        .auth(d.tokens.get(d.recepcionista.id)!, { type: 'bearer' })
        .send({ nombre: 'Ajeno' }).expect(403);
      await request(http).patch(`/servicios/${creado.id}`)
        .auth(d.tokens.get(d.adminAjeno.id)!, { type: 'bearer' })
        .send({ nombre: 'Ajeno' }).expect(404);
      await request(http).patch(`/servicios/${creado.id}`)
        .auth(d.tokens.get(d.ana.id)!, { type: 'bearer' })
        .send({ nombre: 'Diseño actualizado' }).expect(200);
      await request(http).patch(`/servicios/${creado.id}`)
        .auth(d.tokens.get(d.admin.id)!, { type: 'bearer' })
        .send({ costo: '16.00' }).expect(200);
      await request(http).post(`/servicios/${creado.id}/desactivar`)
        .auth(d.tokens.get(d.ana.id)!, { type: 'bearer' })
        .send({}).expect(403);
      await request(http).post('/servicios')
        .auth(d.tokens.get(d.recepcionista.id)!, { type: 'bearer' })
        .send({ nombre: 'Prohibido', costo: '1.00', duracionMinutos: 10 }).expect(403);
      await request(http).get(`/servicios/${creado.id}`)
        .auth(d.tokens.get(d.adminAjeno.id)!, { type: 'bearer' }).expect(404);
      await request(http).patch(`/servicios/${d.servicioAjeno.id}`)
        .auth(d.tokens.get(d.ana.id)!, { type: 'bearer' })
        .send({ nombre: 'Cruce' }).expect(404);
      await request(http).put(`/profesionales/${d.ana.id}/sucursales/${d.sucursalAjena.id}/servicios`)
        .auth(d.tokens.get(d.admin.id)!, { type: 'bearer' })
        .send({ servicioIds: [d.servicioAjeno.id] }).expect(404);
      expect(await db.getRepository(PersonalServicioSucursal).countBy({
        negocioId: d.negocio.id, personalId: d.ana.id, activo: false })).toBe(0);
      expect(await db.getRepository(PersonalSucursal).countBy({ negocioId: d.negocio.id,
        personalId: d.ana.id, activo: false })).toBe(0);
    });
  });
});
