import { ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ReservaCorreoService } from '../src/altas/reserva-correo.service';
import { AuditoriaService } from '../src/auditoria/auditoria.service';
import { Rol } from '../src/auth/enums/rol.enum';
import { AutorizacionService } from '../src/auth/services/autorizacion.service';
import { PoliticaContrasenasService } from '../src/auth/services/politica-contrasenas.service';
import { HorarioPersonal } from '../src/horarios/entities/horario-personal.entity';
import { ExcepcionHorario } from '../src/horarios/entities/excepcion-horario.entity';
import { FranjaExcepcionHorario } from '../src/horarios/entities/franja-excepcion-horario.entity';
import { HorariosService } from '../src/horarios/horarios.service';
import { Negocio } from '../src/negocios/entities/negocio.entity';
import { Personal } from '../src/profesionales/entities/personal.entity';
import { PersonalServicioSucursal } from '../src/profesionales/entities/personal-servicio-sucursal.entity';
import { PersonalSucursal } from '../src/profesionales/entities/personal-sucursal.entity';
import { ProfesionalesService } from '../src/profesionales/profesionales.service';
import { Servicio } from '../src/servicios/entities/servicio.entity';
import { Sucursal } from '../src/sucursales/entities/sucursal.entity';
import { Usuario } from '../src/usuarios/entities/usuario.entity';
import { conBaseMigrada } from './support/mariadb';
import { BarreraDos } from './support/carreras-modulo-1';

const ahora = new Date('2026-10-01T12:00:00.000Z');
const desde = '2026-10-01';

function profesionales(db: DataSource): ProfesionalesService {
  return new ProfesionalesService(db.getRepository(Personal), new AutorizacionService(),
    new PoliticaContrasenasService(), new ReservaCorreoService(), new AuditoriaService());
}

function horarios(db: DataSource): HorariosService {
  return new HorariosService(db.getRepository(HorarioPersonal));
}

async function preparar(db: DataSource) {
  const negocio = await db.getRepository(Negocio).save({ nombre: 'Atención individual',
    slug: 'atencion-individual', emailContacto: 'atencion@example.test',
    creadoEn: ahora, activadoEn: ahora, limiteSucursalesActivas: 2 });
  const admin = await db.getRepository(Usuario).save({ negocioId: negocio.id, nombre: 'Admin',
    email: 'admin-atencion@example.test', passwordHash: 'hash', rol: Rol.ADMIN_NEGOCIO,
    activo: true, creadoEn: ahora, activadoEn: ahora });
  const sucursales = await db.getRepository(Sucursal).save(['Centro', 'Norte'].map((nombre) => ({
    negocioId: negocio.id, nombre, direccion: 'Calle Uno', telefono: '6141234567',
    zonaHoraria: 'America/Chihuahua', activo: true })));
  const servicio = await db.getRepository(Servicio).save({ negocioId: negocio.id,
    nombre: 'Corte', costo: '10.00', duracionMinutos: 30, activo: true });
  const perfil = await profesionales(db).crear(admin.id, { nombre: 'Ana',
    correo: 'ana-atencion@example.test', password: 'Clave-profesional-123',
    especialidad: 'Estilismo' }, ahora);
  await profesionales(db).asignarSucursales(admin.id, perfil.id,
    { sucursalIds: sucursales.map((s) => s.id) });
  await profesionales(db).seleccionarServicios(admin.id, perfil.id,
    { servicioIds: [servicio.id] });
  return { negocio, admin, sucursales, servicio, perfil };
}

async function eventos(db: DataSource, negocioId: number, personalId: number, accion: string) {
  const filas: { total: string }[] = await db.query(`SELECT COUNT(*) total FROM eventos_auditoria
    WHERE negocio_id = ? AND recurso_tipo = 'profesional' AND recurso_id = ? AND accion = ?`,
  [negocioId, personalId, accion]);
  return Number(filas[0].total);
}

describe('FIX-T024–T029: estado individual y carreras con horarios', () => {
  it('conserva horarios y oferta al apagar; reactivar rechaza un empalme heredado sin auditar', async () => {
    await conBaseMigrada(async (db) => {
      const { negocio, admin, sucursales, servicio, perfil } = await preparar(db);
      const [centro, norte] = sucursales;
      await horarios(db).guardarSemana(negocio.id, perfil.id, [
        { diaSemana: 1, orden: 1, sucursalId: centro.id, inicioMinutos: 540,
          finMinutos: 600, activo: true },
        { diaSemana: 1, orden: 2, sucursalId: norte.id, inicioMinutos: 660,
          finMinutos: 720, activo: true },
      ], desde);
      await profesionales(db).cambiarAtencionSucursal(admin.id, perfil.id, norte.id,
        false, desde);
      const preferencias = await db.getRepository(PersonalServicioSucursal).findBy({
        negocioId: negocio.id, personalId: perfil.id });
      expect(preferencias).toHaveLength(2);
      expect(await db.getRepository(HorarioPersonal).countBy({ negocioId: negocio.id,
        personalId: perfil.id })).toBe(2);
      // Simula una franja heredada conflictiva que no pasó por el editor actual.
      await db.getRepository(HorarioPersonal).update({ negocioId: negocio.id,
        personalId: perfil.id, sucursalId: norte.id },
      { inicioMinutos: 570, finMinutos: 630 });
      const total = await eventos(db, negocio.id, perfil.id,
        'profesional_atencion_sucursal_modificada');
      await expect(profesionales(db).cambiarAtencionSucursal(admin.id, perfil.id,
        norte.id, true, desde)).rejects.toBeInstanceOf(ConflictException);
      expect(await db.getRepository(PersonalSucursal).findOneByOrFail({
        negocioId: negocio.id, personalId: perfil.id, sucursalId: norte.id }))
        .toMatchObject({ activo: false });
      expect(await db.getRepository(PersonalServicioSucursal).findBy({
        negocioId: negocio.id, personalId: perfil.id })).toEqual(preferencias);
      expect(await eventos(db, negocio.id, perfil.id,
        'profesional_atencion_sucursal_modificada')).toBe(total);
      await db.getRepository(HorarioPersonal).update({ negocioId: negocio.id,
        personalId: perfil.id, sucursalId: norte.id },
      { inicioMinutos: 660, finMinutos: 720 });
      // Una excepción heredada también debe bloquear la reactivación completa.
      const excepcion = await db.getRepository(ExcepcionHorario).save({
        negocioId: negocio.id, personalId: perfil.id, sucursalId: norte.id,
        fechaLocal: '2026-10-05' });
      await db.getRepository(FranjaExcepcionHorario).save({ negocioId: negocio.id,
        excepcionId: excepcion.id, orden: 1, inicioMinutos: 570,
        finMinutos: 630 });
      await expect(profesionales(db).cambiarAtencionSucursal(admin.id, perfil.id,
        norte.id, true, desde)).rejects.toBeInstanceOf(ConflictException);
      expect(await eventos(db, negocio.id, perfil.id,
        'profesional_atencion_sucursal_modificada')).toBe(total);
      await db.getRepository(FranjaExcepcionHorario).delete({ negocioId: negocio.id,
        excepcionId: excepcion.id });
      await db.getRepository(ExcepcionHorario).delete({ negocioId: negocio.id,
        id: excepcion.id });
      await profesionales(db).cambiarAtencionSucursal(admin.id, perfil.id,
        norte.id, true, desde);
      await profesionales(db).cambiarAtencionSucursal(admin.id, perfil.id,
        norte.id, true, desde);
      expect(await eventos(db, negocio.id, perfil.id,
        'profesional_atencion_sucursal_modificada')).toBe(total + 1);
      expect((await profesionales(db).ofertaSucursal(admin.id, norte.id))
        .map((s) => s.id)).toEqual([servicio.id]);
    });
  });

  it.each(['semana', 'excepcion'] as const)(
    'serializa reactivación frente a edición de %s en dos conexiones', async (tipo) => {
      await conBaseMigrada(async (db, segunda) => {
        const { negocio, admin, sucursales, perfil } = await preparar(db);
        const [centro, norte] = sucursales;
        const semana = await horarios(db).guardarSemana(negocio.id, perfil.id, [
          { diaSemana: 1, orden: 1, sucursalId: centro.id, inicioMinutos: 540,
            finMinutos: 600, activo: true },
          { diaSemana: 1, orden: 2, sucursalId: norte.id, inicioMinutos: 660,
            finMinutos: 720, activo: true },
        ], desde);
        await profesionales(db).cambiarAtencionSucursal(admin.id, perfil.id,
          norte.id, false, desde);
        const total = await eventos(db, negocio.id, perfil.id,
          'profesional_atencion_sucursal_modificada');
        const barrera = new BarreraDos();
        // Ambas operaciones llegan juntas, pero deben tomar el mismo bloqueo de perfil.
        const resultados = await Promise.allSettled([
          barrera.esperar().then(() => profesionales(db).cambiarAtencionSucursal(
            admin.id, perfil.id, norte.id, true, desde)),
          barrera.esperar().then(() => tipo === 'semana'
            ? horarios(segunda).guardarSemana(negocio.id, perfil.id, [
              { ...semana[0] }, { ...semana[1], inicioMinutos: 570, finMinutos: 630 },
            ], desde)
            : horarios(segunda).guardarExcepcion(negocio.id, perfil.id,
              '2026-10-05', norte.id, [{ orden: 1, inicioMinutos: 570,
                finMinutos: 630 }], desde)),
        ]);
        expect(resultados[0].status).toBe('fulfilled');
        expect(resultados[1].status).toBe('rejected');
        expect((resultados[1] as PromiseRejectedResult).reason)
          .toBeInstanceOf(ConflictException);
        expect(await db.getRepository(PersonalSucursal).findOneByOrFail({ negocioId: negocio.id,
          personalId: perfil.id, sucursalId: norte.id })).toMatchObject({ activo: true });
        expect(await eventos(db, negocio.id, perfil.id,
          'profesional_atencion_sucursal_modificada')).toBe(total + 1);
      });
    });
});
