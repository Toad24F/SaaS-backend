import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { conBaseMigrada } from './support/mariadb';
import { Negocio } from '../src/negocios/entities/negocio.entity';
import { Usuario } from '../src/usuarios/entities/usuario.entity';
import { Rol } from '../src/auth/enums/rol.enum';
import { Sucursal } from '../src/sucursales/entities/sucursal.entity';
import { Servicio } from '../src/servicios/entities/servicio.entity';
import { Personal } from '../src/profesionales/entities/personal.entity';
import { SucursalesService } from '../src/sucursales/sucursales.service';
import { ServiciosService } from '../src/servicios/servicios.service';
import { ProfesionalesService } from '../src/profesionales/profesionales.service';
import { AutorizacionService } from '../src/auth/services/autorizacion.service';
import { AuditoriaService } from '../src/auditoria/auditoria.service';
import { PoliticaContrasenasService } from '../src/auth/services/politica-contrasenas.service';
import { ReservaCorreoService } from '../src/altas/reserva-correo.service';
import { CorreoAcceso } from '../src/altas/entities/correo-acceso.entity';
import { PersonalSucursal } from '../src/profesionales/entities/personal-sucursal.entity';
import { PersonalServicio } from '../src/profesionales/entities/personal-servicio.entity';

const sucursales = (db: DataSource) => new SucursalesService(db.getRepository(Sucursal),
  new AutorizacionService(), new AuditoriaService());
const servicios = (db: DataSource) => new ServiciosService(db.getRepository(Servicio),
  new AutorizacionService(), new AuditoriaService());
const profesionales = (db: DataSource) => new ProfesionalesService(db.getRepository(Personal),
  new AutorizacionService(), new PoliticaContrasenasService(),
  new ReservaCorreoService(), new AuditoriaService());

async function preparar(db: DataSource, conRelaciones: boolean) {
  const ahora = new Date('2026-10-01T12:00:00Z');
  const negocio = await db.getRepository(Negocio).save({ nombre: 'Retirada',
    slug: `retirada-${randomUUID()}`, emailContacto: `${randomUUID()}@example.test`,
    creadoEn: ahora, activadoEn: ahora });
  const admin = await db.getRepository(Usuario).save({ negocioId: negocio.id,
    nombre: `Admin ${randomUUID()}`, email: `${randomUUID()}@example.test`,
    passwordHash: 'hash', rol: Rol.ADMIN_NEGOCIO, activo: true,
    creadoEn: ahora, activadoEn: ahora });
  const sucursal = await sucursales(db).crear(admin.id, { nombre: 'Centro',
    direccion: 'Calle Uno', telefono: '6141234567', zonaHoraria: 'America/Chihuahua' });
  const servicio = await servicios(db).crear(admin.id, { nombre: 'Consulta',
    costo: '100.00', duracionMinutos: 30 });
  const cuenta = await db.getRepository(Usuario).save({ negocioId: negocio.id,
    nombre: `Ana ${randomUUID()}`, email: `${randomUUID()}@example.test`,
    passwordHash: 'hash', rol: Rol.PROFESIONAL, activo: true,
    creadoEn: ahora, activadoEn: ahora });
  const perfil = await db.getRepository(Personal).save({ id: cuenta.id,
    negocioId: negocio.id, especialidad: 'General' });
  await new ReservaCorreoService().reservarUsuario(db.manager, { usuarioId: cuenta.id,
    negocioId: negocio.id, correo: cuenta.email });
  if (conRelaciones) {
    await db.getRepository(PersonalSucursal).save({ negocioId: negocio.id,
      personalId: perfil.id, sucursalId: sucursal.id, activo: true });
    await db.getRepository(PersonalServicio).save({ negocioId: negocio.id,
      personalId: perfil.id, servicioId: servicio.id, activo: true });
  }
  return { ahora, negocio, admin, sucursal, servicio, cuenta, perfil };
}

describe('Bajas históricas adaptadas a ALA-T061–T064', () => {
  it.each([false, true])('inhabilita con relaciones=%s sin borrar identidad ni duplicar auditoría',
    async (conRelaciones) => {
      await conBaseMigrada(async (db) => {
        const f = await preparar(db, conRelaciones);
        // El mismo flujo se aplica con o sin relaciones; una repetición es idempotente.
        for (let intento = 0; intento < 2; intento++) {
          await sucursales(db).inhabilitar(f.admin.id, f.sucursal.id, f.ahora);
          await servicios(db).inhabilitar(f.admin.id, f.servicio.id, f.ahora);
          await profesionales(db).inhabilitar(f.admin.id, f.perfil.id, f.ahora);
        }
        expect(await db.getRepository(Sucursal).findOneByOrFail({ id: f.sucursal.id }))
          .toMatchObject({ activo: false, inhabilitadoEn: f.ahora });
        expect(await db.getRepository(Servicio).findOneByOrFail({ id: f.servicio.id }))
          .toMatchObject({ activo: false, costo: '100.00', inhabilitadoEn: f.ahora });
        expect(await db.getRepository(Usuario).findOneByOrFail({ id: f.cuenta.id }))
          .toMatchObject({ activo: false, email: f.cuenta.email,
            passwordHash: 'hash', inhabilitadoEn: f.ahora });
        expect(await db.getRepository(Personal).countBy({ id: f.perfil.id })).toBe(1);
        expect(await db.getRepository(CorreoAcceso).countBy({ usuarioId: f.cuenta.id })).toBe(1);
        expect(await db.getRepository(PersonalSucursal).countBy({ personalId: f.perfil.id }))
          .toBe(conRelaciones ? 1 : 0);
        expect(await db.getRepository(PersonalServicio).countBy({ personalId: f.perfil.id }))
          .toBe(conRelaciones ? 1 : 0);
        const eventos = await db.query(`SELECT accion FROM eventos_auditoria WHERE negocio_id=?
          AND accion IN ('sucursal_inhabilitada','servicio_inhabilitado',
            'profesional_inhabilitado') ORDER BY accion`, [f.negocio.id]);
        expect(eventos.map((fila: { accion: string }) => fila.accion)).toEqual([
          'profesional_inhabilitado', 'servicio_inhabilitado', 'sucursal_inhabilitada',
        ]);
      });
    });
});
