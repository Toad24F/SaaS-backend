import { randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { Rol } from '../src/auth/enums/rol.enum';
import { AutorizacionService } from '../src/auth/services/autorizacion.service';
import { PoliticaContrasenasService } from '../src/auth/services/politica-contrasenas.service';
import { AuditoriaService } from '../src/auditoria/auditoria.service';
import { EventoAuditoria } from '../src/auditoria/entities/evento-auditoria.entity';
import { ReservaCorreoService } from '../src/altas/reserva-correo.service';
import { CorreoAcceso } from '../src/altas/entities/correo-acceso.entity';
import { Negocio } from '../src/negocios/entities/negocio.entity';
import { Personal } from '../src/profesionales/entities/personal.entity';
import { PersonalSucursal } from '../src/profesionales/entities/personal-sucursal.entity';
import { ProfesionalesService } from '../src/profesionales/profesionales.service';
import { Sucursal } from '../src/sucursales/entities/sucursal.entity';
import { CuposUsuariosService } from '../src/usuarios/cupos-usuarios.service';
import { Usuario } from '../src/usuarios/entities/usuario.entity';
import { UsuariosService } from '../src/usuarios/usuarios.service';
import { conBaseMigrada } from './support/mariadb';

const ahora = () => new Date(Date.now() + 60_000);
// Los servicios reales comparten el manager de la base migrada de cada caso.
const profesionales = (db: DataSource) => new ProfesionalesService(db.getRepository(Personal),
  new AutorizacionService(), new PoliticaContrasenasService(),
  new ReservaCorreoService(), new AuditoriaService());
const recepcionistas = (db: DataSource) => new UsuariosService(db.getRepository(Usuario),
  new PoliticaContrasenasService(), new AuditoriaService(), new ReservaCorreoService());

async function escenario(db: DataSource) {
  const tiempo = ahora();
  const negocio = await db.getRepository(Negocio).save({ nombre: 'Cupos ALA',
    slug: `cupos-${randomUUID()}`, emailContacto: `${randomUUID()}@example.test`,
    activadoEn: tiempo });
  const admin = await db.getRepository(Usuario).save({ negocioId: negocio.id,
    nombre: 'Administrador', email: `${randomUUID()}@example.test`, passwordHash: 'hash',
    rol: Rol.ADMIN_NEGOCIO, activo: true, creadoEn: tiempo, activadoEn: tiempo });
  const superadmin = await db.getRepository(Usuario).save({ negocioId: null,
    nombre: 'Superadmin', email: `${randomUUID()}@example.test`, passwordHash: 'hash',
    rol: Rol.SUPERADMIN, activo: true, creadoEn: tiempo, activadoEn: tiempo });
  return { negocio, admin, superadmin, tiempo };
}

async function cuenta(db: DataSource, negocioId: number, rol: Rol, activo = true,
  inhabilitadoEn: Date | null = null) {
  const tiempo = ahora();
  return db.getRepository(Usuario).save({ negocioId, nombre: `Persona ${randomUUID()}`,
    email: `${randomUUID()}@example.test`, passwordHash: 'hash', rol, activo,
    inhabilitadoEn, creadoEn: tiempo, activadoEn: tiempo });
}

describe('ALA-T051–T056: cupos de cuentas por negocio y rol', () => {
  it('cuenta una vez al profesional multisucursal y excluye otros roles y estados', async () => {
    await conBaseMigrada(async (db) => {
      const f = await escenario(db);
      const p = await cuenta(db, f.negocio.id, Rol.PROFESIONAL);
      // Dos asignaciones pertenecen al mismo usuario; el conteo no debe unirlas.
      await db.getRepository(Personal).save({ id: p.id, negocioId: f.negocio.id,
        especialidad: 'General' });
      const sucursales = await db.getRepository(Sucursal).save([1, 2].map((n) => ({
        negocioId: f.negocio.id, nombre: `Sucursal ${n}`, direccion: 'Calle uno',
        telefono: '6141234567', zonaHoraria: 'America/Chihuahua', activo: true })));
      await db.getRepository(PersonalSucursal).save(sucursales.map((s) => ({
        negocioId: f.negocio.id, personalId: p.id, sucursalId: s.id, activo: true })));
      await cuenta(db, f.negocio.id, Rol.PROFESIONAL, false);
      await cuenta(db, f.negocio.id, Rol.PROFESIONAL, false, f.tiempo);
      await cuenta(db, f.negocio.id, Rol.RECEPCIONISTA);
      const otro = await escenario(db);
      await cuenta(db, otro.negocio.id, Rol.PROFESIONAL);
      expect(await new CuposUsuariosService(db).consultar(f.negocio.id)).toMatchObject({
        profesionales: { limite: 5, activos: 1, disponibles: 4 },
        recepcionistas: { limite: 3, activos: 1, disponibles: 2 } });
    });
  });

  it('cambia ambos límites juntos y rechaza reducción inferior al consumo sin mutar ni auditar', async () => {
    await conBaseMigrada(async (db) => {
      const f = await escenario(db);
      await cuenta(db, f.negocio.id, Rol.PROFESIONAL);
      await new CuposUsuariosService(db).cambiarLimites(f.superadmin.id, f.negocio.id,
        { profesionales: 2, recepcionistas: 1 });
      await expect(new CuposUsuariosService(db).cambiarLimites(f.superadmin.id, f.negocio.id,
        { profesionales: 1, recepcionistas: 0 })).rejects.toThrow();
      await cuenta(db, f.negocio.id, Rol.PROFESIONAL);
      await expect(new CuposUsuariosService(db).cambiarLimites(f.superadmin.id, f.negocio.id,
        { profesionales: 1, recepcionistas: 3 })).rejects.toBeInstanceOf(ConflictException);
      expect(await new CuposUsuariosService(db).consultar(f.negocio.id)).toMatchObject({
        profesionales: { limite: 2, activos: 2 }, recepcionistas: { limite: 1 } });
      expect(await db.getRepository(EventoAuditoria).count({ where: { negocioId: f.negocio.id } }))
        .toBe(1);
    });
  });

  it('reserva el cambio al superadmin y revierte ambos límites si falla auditoría', async () => {
    await conBaseMigrada(async (db) => {
      const f = await escenario(db);
      await expect(new CuposUsuariosService(db).cambiarLimites(f.admin.id, f.negocio.id,
        { profesionales: 2, recepcionistas: 2 })).rejects.toMatchObject({ status: 403 });
      const fallo = jest.spyOn(AuditoriaService.prototype, 'registrar')
        .mockRejectedValueOnce(new Error('Auditoría no disponible'));
      try {
        await expect(new CuposUsuariosService(db).cambiarLimites(f.superadmin.id, f.negocio.id,
          { profesionales: 2, recepcionistas: 2 })).rejects.toThrow('Auditoría no disponible');
      } finally { fallo.mockRestore(); }
      expect(await new CuposUsuariosService(db).consultar(f.negocio.id)).toMatchObject({
        profesionales: { limite: 5 }, recepcionistas: { limite: 3 } });
      expect(await db.getRepository(EventoAuditoria).count({ where: { negocioId: f.negocio.id } }))
        .toBe(0);
    });
  });

  it('rechaza altas excedentes sin usuario, perfil, reserva de correo ni auditoría parcial', async () => {
    await conBaseMigrada(async (db) => {
      const f = await escenario(db);
      await new CuposUsuariosService(db).cambiarLimites(f.superadmin.id, f.negocio.id,
        { profesionales: 1, recepcionistas: 1 });
      await profesionales(db).crear(f.admin.id, { nombre: 'Profesional uno',
        correo: `${randomUUID()}@example.test`, password: 'Clave-profesional-123',
        especialidad: 'General' }, f.tiempo);
      await recepcionistas(db).crearRecepcionista({ actorUsuarioId: f.admin.id,
        nombre: 'Recepcionista uno', email: `${randomUUID()}@example.test`,
        password: 'Clave-recepcion-123', ahora: f.tiempo });
      const antes = {
        // Se comparan las tablas definitivas después de ambos rechazos.
        usuarios: await db.getRepository(Usuario).count({ where: { negocioId: f.negocio.id } }),
        perfiles: await db.getRepository(Personal).count({ where: { negocioId: f.negocio.id } }),
        reservas: await db.getRepository(CorreoAcceso).count(),
        auditoria: await db.getRepository(EventoAuditoria).count({ where: { negocioId: f.negocio.id } }),
      };
      await expect(profesionales(db).crear(f.admin.id, { nombre: 'Profesional dos',
        correo: `${randomUUID()}@example.test`, password: 'Clave-profesional-123',
        especialidad: 'General' }, f.tiempo)).rejects.toBeInstanceOf(ConflictException);
      await expect(recepcionistas(db).crearRecepcionista({ actorUsuarioId: f.admin.id,
        nombre: 'Recepcionista dos', email: `${randomUUID()}@example.test`,
        password: 'Clave-recepcion-123', ahora: f.tiempo }))
        .rejects.toBeInstanceOf(ConflictException);
      expect(await db.getRepository(Usuario).count({ where: { negocioId: f.negocio.id } }))
        .toBe(antes.usuarios);
      expect(await db.getRepository(Personal).count({ where: { negocioId: f.negocio.id } }))
        .toBe(antes.perfiles);
      expect(await db.getRepository(CorreoAcceso).count())
        .toBe(antes.reservas);
      expect(await db.getRepository(EventoAuditoria).count({ where: { negocioId: f.negocio.id } }))
        .toBe(antes.auditoria);
      const otro = await escenario(db);
      await recepcionistas(db).crearRecepcionista({ actorUsuarioId: otro.admin.id,
        nombre: 'Recepcionista independiente', email: `${randomUUID()}@example.test`,
        password: 'Clave-recepcion-123', ahora: otro.tiempo });
    });
  });

  it('desactivar libera un lugar y reactivar exige cupo en ambos roles', async () => {
    await conBaseMigrada(async (db) => {
      const f = await escenario(db);
      await new CuposUsuariosService(db).cambiarLimites(f.superadmin.id, f.negocio.id,
        { profesionales: 1, recepcionistas: 1 });
      const p = await profesionales(db).crear(f.admin.id, { nombre: 'Profesional uno',
        correo: `${randomUUID()}@example.test`, password: 'Clave-profesional-123',
        especialidad: 'General' }, f.tiempo);
      const r = await recepcionistas(db).crearRecepcionista({ actorUsuarioId: f.admin.id,
        nombre: 'Recepcionista uno', email: `${randomUUID()}@example.test`,
        password: 'Clave-recepcion-123', ahora: f.tiempo });
      await profesionales(db).cambiarEstado(f.admin.id, p.id, false, f.tiempo);
      await recepcionistas(db).desactivarRecepcionista(f.admin.id, r.id, f.tiempo);
      expect(await new CuposUsuariosService(db).consultar(f.negocio.id)).toMatchObject({
        profesionales: { activos: 0 }, recepcionistas: { activos: 0 } });
      const p2 = await profesionales(db).crear(f.admin.id, { nombre: 'Profesional dos',
        correo: `${randomUUID()}@example.test`, password: 'Clave-profesional-123',
        especialidad: 'General' }, f.tiempo);
      const r2 = await recepcionistas(db).crearRecepcionista({ actorUsuarioId: f.admin.id,
        nombre: 'Recepcionista dos', email: `${randomUUID()}@example.test`,
        password: 'Clave-recepcion-123', ahora: f.tiempo });
      await expect(profesionales(db).cambiarEstado(f.admin.id, p.id, true, f.tiempo))
        .rejects.toBeInstanceOf(ConflictException);
      await expect(recepcionistas(db).reactivarRecepcionista(f.admin.id, r.id, f.tiempo))
        .rejects.toBeInstanceOf(ConflictException);
      await profesionales(db).cambiarEstado(f.admin.id, p2.id, false, f.tiempo);
      await recepcionistas(db).desactivarRecepcionista(f.admin.id, r2.id, f.tiempo);
      await profesionales(db).cambiarEstado(f.admin.id, p.id, true, f.tiempo);
      await recepcionistas(db).reactivarRecepcionista(f.admin.id, r.id, f.tiempo);
      expect(await new CuposUsuariosService(db).consultar(f.negocio.id)).toMatchObject({
        profesionales: { activos: 1 }, recepcionistas: { activos: 1 } });
    });
  });
});
