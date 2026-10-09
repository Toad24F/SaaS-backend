import { ConflictException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ReservaCorreoService } from '../src/altas/reserva-correo.service';
import { AuditoriaService } from '../src/auditoria/auditoria.service';
import { Rol } from '../src/auth/enums/rol.enum';
import { AutorizacionService } from '../src/auth/services/autorizacion.service';
import { PoliticaContrasenasService } from '../src/auth/services/politica-contrasenas.service';
import { Negocio } from '../src/negocios/entities/negocio.entity';
import { Personal } from '../src/profesionales/entities/personal.entity';
import { PersonalServicio } from '../src/profesionales/entities/personal-servicio.entity';
import { PersonalServicioSucursal } from '../src/profesionales/entities/personal-servicio-sucursal.entity';
import { PersonalSucursal } from '../src/profesionales/entities/personal-sucursal.entity';
import { ProfesionalesService } from '../src/profesionales/profesionales.service';
import { Servicio } from '../src/servicios/entities/servicio.entity';
import { Sucursal } from '../src/sucursales/entities/sucursal.entity';
import { Usuario } from '../src/usuarios/entities/usuario.entity';
import { conBaseMigrada } from './support/mariadb';

const ahora = new Date('2026-10-01T12:00:00.000Z');

function profesionales(db: DataSource): ProfesionalesService {
  return new ProfesionalesService(db.getRepository(Personal), new AutorizacionService(),
    new PoliticaContrasenasService(), new ReservaCorreoService(), new AuditoriaService());
}

async function escenario(db: DataSource) {
  // Dos negocios y dos perfiles permiten probar que ningún reemplazo cruza pertenencia.
  const negocio = await db.getRepository(Negocio).save({ nombre: 'Oferta conservada',
    slug: 'oferta-conservada', emailContacto: 'oferta@example.test',
    creadoEn: ahora, activadoEn: ahora, limiteSucursalesActivas: 3 });
  const ajeno = await db.getRepository(Negocio).save({ nombre: 'Ajeno', slug: 'ajeno-oferta',
    emailContacto: 'ajeno-oferta@example.test', creadoEn: ahora, activadoEn: ahora,
    limiteSucursalesActivas: 1 });
  const admin = await db.getRepository(Usuario).save({ negocioId: negocio.id, nombre: 'Admin',
    email: 'admin-oferta@example.test', passwordHash: 'hash', rol: Rol.ADMIN_NEGOCIO,
    activo: true, creadoEn: ahora, activadoEn: ahora });
  const sucursales = await db.getRepository(Sucursal).save(['Centro', 'Norte'].map((nombre) => ({
    negocioId: negocio.id, nombre, direccion: 'Calle Uno', telefono: '6141234567',
    zonaHoraria: 'America/Chihuahua', activo: true })));
  const sucursalAjena = await db.getRepository(Sucursal).save({ negocioId: ajeno.id,
    nombre: 'Ajena', direccion: 'Calle Dos', telefono: '6141234567',
    zonaHoraria: 'America/Chihuahua', activo: true });
  const servicios = await db.getRepository(Servicio).save(['Corte', 'Tinte', 'Peinado'].map(
    (nombre) => ({ negocioId: negocio.id, nombre, costo: '10.00', duracionMinutos: 30,
      activo: true })));
  const ana = await profesionales(db).crear(admin.id, { nombre: 'Ana',
    correo: 'ana-oferta@example.test', password: 'Clave-profesional-123',
    especialidad: 'Estilismo' }, ahora);
  const bea = await profesionales(db).crear(admin.id, { nombre: 'Bea',
    correo: 'bea-oferta@example.test', password: 'Clave-profesional-123',
    especialidad: 'Estilismo' }, ahora);
  return { negocio, admin, ana, bea, sucursales, sucursalAjena, servicios };
}

async function eventos(db: DataSource, negocioId: number, personalId: number, accion: string) {
  const filas: { total: string }[] = await db.query(`SELECT COUNT(*) AS total FROM eventos_auditoria
    WHERE negocio_id = ? AND recurso_tipo = 'profesional' AND recurso_id = ? AND accion = ?`,
  [negocioId, personalId, accion]);
  return Number(filas[0].total);
}

describe('FIX-T019–T023: selección y asignación conservan preferencias', () => {
  it('desmarca, vacía y recupera preferencias sin afectar a otro profesional ni duplicar auditoría', async () => {
    await conBaseMigrada(async (db) => {
      const { negocio, admin, ana, bea, sucursales, servicios } = await escenario(db);
      const [centro, norte] = sucursales;
      const [corte, tinte, peinado] = servicios;
      await profesionales(db).asignarSucursales(admin.id, ana.id,
        { sucursalIds: [centro.id, norte.id] });
      await profesionales(db).asignarSucursales(admin.id, bea.id, { sucursalIds: [centro.id] });
      await profesionales(db).seleccionarServicios(admin.id, bea.id,
        { servicioIds: [peinado.id] });
      await profesionales(db).seleccionarServicios(admin.id, ana.id,
        { servicioIds: [corte.id, tinte.id] });
      const oferta = db.getRepository(PersonalServicioSucursal);
      expect(await oferta.countBy({ negocioId: negocio.id, personalId: ana.id })).toBe(4);
      // Esta preferencia apagada debe sobrevivir al desmarcado y la recuperación general.
      await oferta.update({ negocioId: negocio.id, personalId: ana.id,
        sucursalId: norte.id, servicioId: corte.id }, { activo: false });

      await profesionales(db).seleccionarServicios(admin.id, ana.id,
        { servicioIds: [tinte.id] });
      expect(await db.getRepository(PersonalServicio).findOneByOrFail({ negocioId: negocio.id,
        personalId: ana.id, servicioId: corte.id })).toMatchObject({ activo: false });
      expect(await oferta.countBy({ negocioId: negocio.id, personalId: ana.id })).toBe(4);
      expect((await profesionales(db).listarServicios(admin.id, ana.id))
        .find((opcion) => opcion.id === corte.id)).toMatchObject({ seleccionado: false });
      expect((await profesionales(db).ofertaSucursal(admin.id, centro.id))
        .map((servicio) => servicio.id)).not.toContain(corte.id);
      const total = await eventos(db, negocio.id, ana.id, 'profesional_servicios_modificados');
      await profesionales(db).seleccionarServicios(admin.id, ana.id,
        { servicioIds: [tinte.id] });
      expect(await eventos(db, negocio.id, ana.id, 'profesional_servicios_modificados'))
        .toBe(total);

      await profesionales(db).seleccionarServicios(admin.id, ana.id,
        { servicioIds: [corte.id, tinte.id] });
      expect(await oferta.findOneByOrFail({ negocioId: negocio.id, personalId: ana.id,
        sucursalId: norte.id, servicioId: corte.id })).toMatchObject({ activo: false });
      expect((await profesionales(db).ofertaSucursal(admin.id, centro.id))
        .map((servicio) => servicio.id)).toContain(corte.id);
      expect((await profesionales(db).ofertaSucursal(admin.id, norte.id))
        .map((servicio) => servicio.id)).not.toContain(corte.id);
      await profesionales(db).seleccionarServicios(admin.id, ana.id, { servicioIds: [] });
      expect(await db.getRepository(PersonalServicio).countBy({ negocioId: negocio.id,
        personalId: ana.id, activo: false })).toBe(2);
      expect(await oferta.countBy({ negocioId: negocio.id, personalId: ana.id })).toBe(4);
      expect((await profesionales(db).listarServicios(admin.id, ana.id))
        .filter((opcion) => opcion.seleccionado)).toEqual([]);
      // Un servicio apagado globalmente no se incorpora como selección inédita.
      await db.getRepository(Servicio).update({ id: peinado.id,
        negocioId: negocio.id }, { activo: false });
      await expect(profesionales(db).seleccionarServicios(admin.id, ana.id,
        { servicioIds: [peinado.id] })).rejects.toBeInstanceOf(ConflictException);
      expect(await oferta.countBy({ negocioId: negocio.id, personalId: ana.id,
        servicioId: peinado.id })).toBe(0);
      expect(await db.getRepository(PersonalServicio).findOneByOrFail({ negocioId: negocio.id,
        personalId: bea.id, servicioId: peinado.id })).toMatchObject({ activo: true });
    });
  });

  it('agrega combinaciones por sucursal y retira únicamente las de la asignación quitada', async () => {
    await conBaseMigrada(async (db) => {
      const { negocio, admin, ana, sucursales, sucursalAjena, servicios } = await escenario(db);
      const [centro, norte] = sucursales;
      const [corte] = servicios;
      await profesionales(db).seleccionarServicios(admin.id, ana.id,
        { servicioIds: [corte.id] });
      await profesionales(db).asignarSucursales(admin.id, ana.id, { sucursalIds: [centro.id] });
      await profesionales(db).asignarSucursales(admin.id, ana.id,
        { sucursalIds: [centro.id, norte.id] });
      const oferta = db.getRepository(PersonalServicioSucursal);
      expect(await oferta.countBy({ negocioId: negocio.id, personalId: ana.id,
        servicioId: corte.id })).toBe(2);
      // Retirar Norte no debe reconstruir Centro ni encender su ajuste individual.
      await oferta.update({ negocioId: negocio.id, personalId: ana.id,
        sucursalId: centro.id, servicioId: corte.id }, { activo: false });
      const total = await eventos(db, negocio.id, ana.id, 'profesional_sucursales_modificadas');
      await profesionales(db).asignarSucursales(admin.id, ana.id,
        { sucursalIds: [centro.id, norte.id] });
      expect(await eventos(db, negocio.id, ana.id, 'profesional_sucursales_modificadas'))
        .toBe(total);
      await profesionales(db).asignarSucursales(admin.id, ana.id, { sucursalIds: [centro.id] });
      expect(await oferta.findBy({ negocioId: negocio.id, personalId: ana.id }))
        .toEqual([expect.objectContaining({ sucursalId: centro.id, activo: false })]);
      expect(await db.getRepository(PersonalSucursal).countBy({ negocioId: negocio.id,
        personalId: ana.id })).toBe(1);
      await profesionales(db).asignarSucursales(admin.id, ana.id,
        { sucursalIds: [centro.id, norte.id] });
      expect(await oferta.findOneByOrFail({ negocioId: negocio.id, personalId: ana.id,
        sucursalId: norte.id, servicioId: corte.id })).toMatchObject({ activo: true });
      await expect(profesionales(db).asignarSucursales(admin.id, ana.id,
        { sucursalIds: [sucursalAjena.id] })).rejects.toBeInstanceOf(NotFoundException);
      expect(await oferta.countBy({ negocioId: negocio.id, personalId: ana.id })).toBe(2);
    });
  });

  it('rechaza retirar una sucursal con horario y conserva asignación, preferencias y auditoría', async () => {
    await conBaseMigrada(async (db) => {
      const { negocio, admin, ana, sucursales, servicios } = await escenario(db);
      const [centro] = sucursales;
      const [corte] = servicios;
      await profesionales(db).asignarSucursales(admin.id, ana.id, { sucursalIds: [centro.id] });
      await profesionales(db).seleccionarServicios(admin.id, ana.id,
        { servicioIds: [corte.id] });
      // La franja vigente impide retirar la asignación y debe revertir toda la operación.
      await db.query(`INSERT INTO horarios_personal
        (negocio_id, personal_id, sucursal_id, dia_semana, orden, inicio_minutos, fin_minutos, activo)
        VALUES (?, ?, ?, 1, 1, 540, 600, 1)`, [negocio.id, ana.id, centro.id]);
      const total = await eventos(db, negocio.id, ana.id, 'profesional_sucursales_modificadas');
      await expect(profesionales(db).asignarSucursales(admin.id, ana.id,
        { sucursalIds: [] })).rejects.toBeInstanceOf(ConflictException);
      expect(await db.getRepository(PersonalSucursal).countBy({ negocioId: negocio.id,
        personalId: ana.id, sucursalId: centro.id })).toBe(1);
      expect(await db.getRepository(PersonalServicioSucursal).countBy({ negocioId: negocio.id,
        personalId: ana.id, sucursalId: centro.id, servicioId: corte.id })).toBe(1);
      expect(await eventos(db, negocio.id, ana.id, 'profesional_sucursales_modificadas'))
        .toBe(total);
    });
  });
});
