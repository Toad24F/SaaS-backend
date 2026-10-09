import { ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ReservaCorreoService } from '../src/altas/reserva-correo.service';
import { AuditoriaService } from '../src/auditoria/auditoria.service';
import { Rol } from '../src/auth/enums/rol.enum';
import { AutorizacionService } from '../src/auth/services/autorizacion.service';
import { PoliticaContrasenasService } from '../src/auth/services/politica-contrasenas.service';
import { Negocio } from '../src/negocios/entities/negocio.entity';
import { Personal } from '../src/profesionales/entities/personal.entity';
import { PersonalServicioSucursal } from '../src/profesionales/entities/personal-servicio-sucursal.entity';
import { PersonalSucursal } from '../src/profesionales/entities/personal-sucursal.entity';
import { ProfesionalesService } from '../src/profesionales/profesionales.service';
import { Servicio } from '../src/servicios/entities/servicio.entity';
import { ServiciosService } from '../src/servicios/servicios.service';
import { Sucursal } from '../src/sucursales/entities/sucursal.entity';
import { SucursalesService } from '../src/sucursales/sucursales.service';
import { Usuario } from '../src/usuarios/entities/usuario.entity';
import { BarreraDos } from './support/carreras-modulo-1';
import { conBaseMigrada } from './support/mariadb';

const ahora = new Date('2026-10-01T12:00:00.000Z');
const desde = '2026-10-01';

function profesionales(db: DataSource) {
  return new ProfesionalesService(db.getRepository(Personal), new AutorizacionService(),
    new PoliticaContrasenasService(), new ReservaCorreoService(), new AuditoriaService());
}
function servicios(db: DataSource) {
  return new ServiciosService(db.getRepository(Servicio), new AutorizacionService(),
    new AuditoriaService());
}
function sucursales(db: DataSource) {
  return new SucursalesService(db.getRepository(Sucursal), new AutorizacionService(),
    new AuditoriaService());
}

async function preparar(db: DataSource) {
  const negocio = await db.getRepository(Negocio).save({ nombre: 'Carrera oferta',
    slug: 'carrera-oferta', emailContacto: 'carrera-oferta@example.test',
    creadoEn: ahora, activadoEn: ahora, limiteSucursalesActivas: 2 });
  const ajeno = await db.getRepository(Negocio).save({ nombre: 'Ajeno',
    slug: 'ajeno-carrera-oferta', emailContacto: 'ajeno-carrera-oferta@example.test',
    creadoEn: ahora, activadoEn: ahora, limiteSucursalesActivas: 1 });
  const admin = await db.getRepository(Usuario).save({ negocioId: negocio.id,
    nombre: 'Admin', email: 'admin-carrera-oferta@example.test', passwordHash: 'hash',
    rol: Rol.ADMIN_NEGOCIO, activo: true, creadoEn: ahora, activadoEn: ahora });
  const sucursal = await db.getRepository(Sucursal).save({ negocioId: negocio.id,
    nombre: 'Centro', direccion: 'Calle Uno', telefono: '6141234567',
    zonaHoraria: 'America/Chihuahua', activo: true });
  const perfil = await profesionales(db).crear(admin.id, { nombre: 'Ana',
    correo: 'ana-carrera-oferta@example.test', password: 'Clave-profesional-123',
    especialidad: 'Estilismo' }, ahora);
  await profesionales(db).asignarSucursales(admin.id, perfil.id,
    { sucursalIds: [sucursal.id] });
  return { negocio, ajeno, admin, sucursal, perfil };
}

async function eventos(db: DataSource, negocioId: number, recursoId: number, accion: string) {
  const filas: { total: string }[] = await db.query(`SELECT COUNT(*) total FROM eventos_auditoria
    WHERE negocio_id = ? AND recurso_id = ? AND accion = ?`, [negocioId, recursoId, accion]);
  return Number(filas[0].total);
}

describe('FIX-T034: reintentos, carreras y conservación de historial', () => {
  it('serializa operaciones opuestas sobre atención y oferta; audita solo transiciones reales', async () => {
    await conBaseMigrada(async (db, segunda) => {
      const { negocio, admin, sucursal, perfil } = await preparar(db);
      const servicio = await servicios(db).crear(admin.id, { nombre: 'Corte',
        costo: '10.00', duracionMinutos: 30 });
      await profesionales(db).seleccionarServicios(admin.id, perfil.id,
        { servicioIds: [servicio.id] });
      const noSeleccionado = await servicios(db).crear(admin.id, { nombre: 'Tinte',
        costo: '12.00', duracionMinutos: 45 });
      const auditoriaPrevia = await eventos(db, negocio.id, perfil.id,
        'profesional_servicios_sucursal_modificados');
      await expect(profesionales(db).seleccionarServiciosSucursal(admin.id, perfil.id,
        sucursal.id, { servicioIds: [noSeleccionado.id] }))
        .rejects.toBeInstanceOf(ConflictException);
      expect(await eventos(db, negocio.id, perfil.id,
        'profesional_servicios_sucursal_modificados')).toBe(auditoriaPrevia);
      expect(await db.getRepository(PersonalServicioSucursal).countBy({ negocioId: negocio.id,
        personalId: perfil.id, servicioId: noSeleccionado.id })).toBe(0);
      const barreraAtencion = new BarreraDos();
      const atencion = await Promise.allSettled([
        barreraAtencion.esperar().then(() => profesionales(db).cambiarAtencionSucursal(
          admin.id, perfil.id, sucursal.id, false, desde)),
        barreraAtencion.esperar().then(() => profesionales(segunda).cambiarAtencionSucursal(
          admin.id, perfil.id, sucursal.id, true, desde)),
      ]);
      expect(atencion.every((resultado) => resultado.status === 'fulfilled')).toBe(true);
      const estadoAtencion = (await db.getRepository(PersonalSucursal).findOneByOrFail({
        negocioId: negocio.id, personalId: perfil.id, sucursalId: sucursal.id })).activo;
      const eventosAtencion = await eventos(db, negocio.id, perfil.id,
        'profesional_atencion_sucursal_modificada');
      expect(eventosAtencion).toBe(estadoAtencion ? 2 : 1);
      await profesionales(db).cambiarAtencionSucursal(admin.id, perfil.id, sucursal.id,
        estadoAtencion, desde);
      expect(await eventos(db, negocio.id, perfil.id,
        'profesional_atencion_sucursal_modificada')).toBe(eventosAtencion);

      const barreraOferta = new BarreraDos();
      const oferta = await Promise.allSettled([
        barreraOferta.esperar().then(() => profesionales(db).seleccionarServiciosSucursal(
          admin.id, perfil.id, sucursal.id, { servicioIds: [] })),
        barreraOferta.esperar().then(() => profesionales(segunda).seleccionarServiciosSucursal(
          admin.id, perfil.id, sucursal.id, { servicioIds: [servicio.id] })),
      ]);
      expect(oferta.every((resultado) => resultado.status === 'fulfilled')).toBe(true);
      const estadoOferta = (await db.getRepository(PersonalServicioSucursal).findOneByOrFail({
        negocioId: negocio.id, personalId: perfil.id, sucursalId: sucursal.id,
        servicioId: servicio.id })).activo;
      const eventosOferta = await eventos(db, negocio.id, perfil.id,
        'profesional_servicios_sucursal_modificados');
      expect(eventosOferta).toBe(estadoOferta ? 2 : 1);
      await profesionales(db).seleccionarServiciosSucursal(admin.id, perfil.id, sucursal.id,
        { servicioIds: estadoOferta ? [servicio.id] : [] });
      expect(await eventos(db, negocio.id, perfil.id,
        'profesional_servicios_sucursal_modificados')).toBe(eventosOferta);
    });
  });

  it('creación profesional y cambio global simultáneos conservan pertenencia e historial', async () => {
    await conBaseMigrada(async (db, segunda) => {
      const { negocio, ajeno, admin, sucursal, perfil } = await preparar(db);
      const barrera = new BarreraDos();
      // Las conexiones compiten sobre el mismo negocio y sucursal, sin mover filas de tenant.
      const resultados = await Promise.allSettled([
        barrera.esperar().then(() => servicios(db).crear(perfil.id, {
          nombre: 'Creado en carrera', costo: '12.00', duracionMinutos: 35 })),
        barrera.esperar().then(() => sucursales(segunda).desactivar(admin.id, sucursal.id)),
      ]);
      expect(resultados.every((resultado) => resultado.status === 'fulfilled')).toBe(true);
      const servicio = (resultados[0] as PromiseFulfilledResult<Servicio>).value;
      expect(servicio).toMatchObject({ negocioId: negocio.id,
        creadorPersonalId: perfil.id, activo: true });
      expect(await db.getRepository(PersonalServicioSucursal).findOneByOrFail({
        negocioId: negocio.id, personalId: perfil.id, sucursalId: sucursal.id,
        servicioId: servicio.id })).toMatchObject({ activo: true });
      expect(await db.getRepository(PersonalServicioSucursal).countBy({
        negocioId: ajeno.id })).toBe(0);
      expect(await profesionales(db).ofertaSucursal(admin.id, sucursal.id)).toEqual([]);
      await sucursales(db).reactivar(admin.id, sucursal.id, desde);
      expect((await profesionales(db).ofertaSucursal(admin.id, sucursal.id))
        .map((fila) => fila.id)).toEqual([servicio.id]);
      expect(await eventos(db, negocio.id, servicio.id, 'servicio_creado')).toBe(1);
      expect(await eventos(db, negocio.id, sucursal.id, 'sucursal_desactivada')).toBe(1);
      await expect(profesionales(db).eliminar(admin.id, perfil.id))
        .rejects.toBeInstanceOf(ConflictException);
      await expect(servicios(db).eliminar(admin.id, servicio.id))
        .rejects.toBeInstanceOf(ConflictException);
      await expect(sucursales(db).eliminar(admin.id, sucursal.id))
        .rejects.toBeInstanceOf(ConflictException);
      expect(await eventos(db, negocio.id, perfil.id, 'profesional_eliminado')).toBe(0);
      expect(await eventos(db, negocio.id, servicio.id, 'servicio_eliminado')).toBe(0);
      expect(await eventos(db, negocio.id, sucursal.id, 'sucursal_eliminada')).toBe(0);
    });
  });
});
