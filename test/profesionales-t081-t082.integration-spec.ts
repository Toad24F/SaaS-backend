import { ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ReservaCorreoService } from '../src/altas/reserva-correo.service';
import { CorreoAcceso } from '../src/altas/entities/correo-acceso.entity';
import { AuditoriaService } from '../src/auditoria/auditoria.service';
import { Rol } from '../src/auth/enums/rol.enum';
import { AutorizacionService } from '../src/auth/services/autorizacion.service';
import { PoliticaContrasenasService } from '../src/auth/services/politica-contrasenas.service';
import { Negocio } from '../src/negocios/entities/negocio.entity';
import { Personal } from '../src/profesionales/entities/personal.entity';
import { PersonalServicio } from '../src/profesionales/entities/personal-servicio.entity';
import { PersonalSucursal } from '../src/profesionales/entities/personal-sucursal.entity';
import { ProfesionalesService } from '../src/profesionales/profesionales.service';
import { Servicio } from '../src/servicios/entities/servicio.entity';
import { ServiciosService } from '../src/servicios/servicios.service';
import { Sucursal } from '../src/sucursales/entities/sucursal.entity';
import { Usuario } from '../src/usuarios/entities/usuario.entity';
import { conBaseMigrada } from './support/mariadb';
import { BarreraDos } from './support/carreras-modulo-1';

const ahora = new Date('2026-10-01T12:00:00.000Z');
const password = 'Clave-profesional-123';

function profesionales(db: DataSource) {
  // Cada instancia usa el manager de su conexión; se ejercitan bloqueos MariaDB reales.
  return new ProfesionalesService(db.getRepository(Personal), new AutorizacionService(),
    new PoliticaContrasenasService(), new ReservaCorreoService(), new AuditoriaService());
}

function servicios(db: DataSource) {
  return new ServiciosService(db.getRepository(Servicio), new AutorizacionService(),
    new AuditoriaService());
}

async function escenario(db: DataSource) {
  const negocio = await db.getRepository(Negocio).save({ nombre: 'Negocio selección',
    // El reloj fijo evita que la activación quede antes del DEFAULT de creación al pasar el tiempo.
    slug: 'pruebas-seleccion', emailContacto: 'seleccion@example.test', creadoEn: ahora, activadoEn: ahora,
    limiteSucursalesActivas: 2 });
  const admin = await db.getRepository(Usuario).save({ negocioId: negocio.id,
    nombre: 'Admin', email: 'admin-seleccion@example.test', passwordHash: 'hash',
    rol: Rol.ADMIN_NEGOCIO, activo: true, creadoEn: ahora, activadoEn: ahora });
  const sucursal = await db.getRepository(Sucursal).save({ negocioId: negocio.id,
    nombre: 'Centro', direccion: 'Calle Uno', telefono: '6141234567',
    zonaHoraria: 'America/Chihuahua', activo: true });
  const catalogo = await db.getRepository(Servicio).save(['Corte', 'Tinte', 'Peinado'].map(
    (nombre) => ({ negocioId: negocio.id, nombre, costo: '10.00',
      duracionMinutos: 30, activo: true })));
  return { negocio, admin, sucursal, catalogo };
}

async function seleccion(db: DataSource, negocioId: number, personalId: number) {
  const filas = await db.getRepository(PersonalServicio).findBy({ negocioId, personalId });
  return filas.map((fila) => fila.servicioId).sort((a, b) => a - b);
}

describe('M1-T081–T082: persistencia y carreras de selección', () => {
  it('guarda, desmarca, recarga y vacía sin alterar cuenta, asignación, catálogo u otro perfil', async () => {
    await conBaseMigrada(async (db, segunda) => {
      const { negocio, admin, sucursal, catalogo } = await escenario(db);
      const a = await profesionales(db).crear(admin.id, { nombre: 'Ana',
        correo: 'ana-seleccion@example.test', password }, ahora);
      const b = await profesionales(db).crear(admin.id, { nombre: 'Bea',
        correo: 'bea-seleccion@example.test', password }, ahora);
      expect(a.id).toBe(a.usuarioId);
      expect(b.id).toBe(b.usuarioId);
      await profesionales(db).asignarSucursales(admin.id, a.id, { sucursalIds: [sucursal.id] });
      await profesionales(db).seleccionarServicios(admin.id, b.id,
        { servicioIds: [catalogo[2].id] });
      const cuentaAntes = await db.getRepository(Usuario).findOneByOrFail({ id: a.usuarioId });
      const catalogoAntes = await db.getRepository(Servicio).findBy({ negocioId: negocio.id });
      await profesionales(db).seleccionarServicios(admin.id, a.id,
        { servicioIds: [catalogo[0].id, catalogo[1].id] });
      expect((await profesionales(segunda).listarServicios(admin.id, a.id))
        .filter((opcion) => opcion.seleccionado).map((opcion) => opcion.id))
        .toEqual([catalogo[0].id, catalogo[1].id]);
      await profesionales(segunda).seleccionarServicios(admin.id, a.id,
        { servicioIds: [catalogo[1].id] });
      expect(await seleccion(db, negocio.id, a.id)).toEqual([catalogo[1].id]);
      await profesionales(db).seleccionarServicios(admin.id, a.id, { servicioIds: [] });
      expect(await seleccion(segunda, negocio.id, a.id)).toEqual([]);
      expect((await profesionales(segunda).listarServicios(admin.id, a.id))
        .filter((opcion) => opcion.seleccionado)).toEqual([]);
      expect(await db.getRepository(Usuario).findOneByOrFail({ id: a.usuarioId }))
        .toEqual(cuentaAntes);
      expect(await db.getRepository(PersonalSucursal).findBy({ negocioId: negocio.id,
        personalId: a.id })).toEqual([expect.objectContaining({ sucursalId: sucursal.id })]);
      expect(await db.getRepository(Servicio).findBy({ negocioId: negocio.id }))
        .toEqual(catalogoAntes);
      expect(await seleccion(db, negocio.id, b.id)).toEqual([catalogo[2].id]);
    });
  });

  it('dos altas con el mismo correo dejan una sola cuenta, perfil, reserva y auditoría', async () => {
    await conBaseMigrada(async (db, segunda) => {
      const { negocio, admin } = await escenario(db);
      const barrera = new BarreraDos();
      const alta = { nombre: 'Profesional', correo: 'unico-seleccion@example.test', password };
      // La barrera inicia ambas solicitudes desde conexiones independientes.
      const resultados = await Promise.allSettled([
        barrera.esperar().then(() => profesionales(db).crear(admin.id, alta, ahora)),
        barrera.esperar().then(() => profesionales(segunda).crear(admin.id, alta, ahora)),
      ]);
      expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect((resultados.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason)
        .toBeInstanceOf(ConflictException);
      expect(await db.getRepository(Usuario).countBy({ email: alta.correo })).toBe(1);
      expect(await db.getRepository(Personal).countBy({ negocioId: negocio.id })).toBe(1);
      expect(await db.getRepository(CorreoAcceso).countBy({ correo: alta.correo })).toBe(1);
      const eventos = await db.query(`SELECT accion FROM eventos_auditoria
        WHERE accion = 'profesional_creado' AND negocio_id = ?`, [negocio.id]);
      expect(eventos).toHaveLength(1);
    });
  });

  it('dos reemplazos del mismo perfil terminan en un conjunto completo y sin duplicados', async () => {
    await conBaseMigrada(async (db, segunda) => {
      const { negocio, admin, catalogo } = await escenario(db);
      const perfil = await profesionales(db).crear(admin.id, { nombre: 'Ana',
        correo: 'ana-carrera@example.test', password }, ahora);
      const barrera = new BarreraDos();
      const uno = [catalogo[0].id, catalogo[1].id];
      const dos = [catalogo[2].id];
      const resultados = await Promise.allSettled([
        barrera.esperar().then(() => profesionales(db).seleccionarServicios(admin.id,
          perfil.id, { servicioIds: uno })),
        barrera.esperar().then(() => profesionales(segunda).seleccionarServicios(admin.id,
          perfil.id, { servicioIds: dos })),
      ]);
      expect(resultados.every((r) => r.status === 'fulfilled')).toBe(true);
      const final = await seleccion(db, negocio.id, perfil.id);
      expect([uno, dos]).toContainEqual(final);
      expect((await profesionales(segunda).listarServicios(admin.id, perfil.id))
        .filter((opcion) => opcion.seleccionado).map((opcion) => opcion.id)).toEqual(final);
      expect(await db.getRepository(PersonalServicio).countBy({ negocioId: negocio.id,
        personalId: perfil.id })).toBe(final.length);
    });
  });

  it('selección frente a desactivación global nunca ofrece el servicio inactivo', async () => {
    await conBaseMigrada(async (db, segunda) => {
      const { negocio, admin, sucursal, catalogo } = await escenario(db);
      const perfil = await profesionales(db).crear(admin.id, { nombre: 'Ana',
        correo: 'ana-inactivo@example.test', password }, ahora);
      await profesionales(db).asignarSucursales(admin.id, perfil.id,
        { sucursalIds: [sucursal.id] });
      const barrera = new BarreraDos();
      const resultados = await Promise.allSettled([
        barrera.esperar().then(() => profesionales(db).seleccionarServicios(admin.id,
          perfil.id, { servicioIds: [catalogo[0].id] })),
        barrera.esperar().then(() => servicios(segunda).cambiarEstado(admin.id,
          catalogo[0].id, false)),
      ]);
      expect(resultados[1].status).toBe('fulfilled');
      expect(await db.getRepository(Servicio).findOneByOrFail({ id: catalogo[0].id }))
        .toMatchObject({ activo: false });
      expect(await profesionales(db).ofertaSucursal(admin.id, sucursal.id)).toEqual([]);
      const guardado = await seleccion(db, negocio.id, perfil.id);
      expect(guardado).toEqual(resultados[0].status === 'fulfilled' ? [catalogo[0].id] : []);
    });
  });
});
