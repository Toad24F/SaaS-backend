import { ConflictException } from '@nestjs/common';
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

function servicios(db: DataSource) { return new ServiciosService(db.getRepository(Servicio),
  new AutorizacionService(), new AuditoriaService()); }
function sucursales(db: DataSource) { return new SucursalesService(db.getRepository(Sucursal),
  new AutorizacionService(), new AuditoriaService()); }
function profesionales(db: DataSource) { return new ProfesionalesService(db.getRepository(Personal),
  new AutorizacionService(), new PoliticaContrasenasService(),
  new ReservaCorreoService(), new AuditoriaService()); }

// La auditoría técnica inicial se conserva aun cuando las tres filas sean elegibles.
async function preparar(db: DataSource) {
  const ahora = new Date('2026-10-01T12:00:00Z');
  const negocio = await db.getRepository(Negocio).save({ nombre: 'Bajas', slug: `bajas-${randomUUID()}`,
    emailContacto: `bajas-${randomUUID()}@example.test`, creadoEn: ahora, activadoEn: ahora,
    limiteSucursalesActivas: 2 });
  const admin = await db.getRepository(Usuario).save({ negocioId: negocio.id, nombre: 'Admin',
    email: `admin-${randomUUID()}@example.test`, passwordHash: 'hash', rol: Rol.ADMIN_NEGOCIO,
    activo: true, creadoEn: ahora, activadoEn: ahora });
  const sede = await sucursales(db).crear(admin.id, { nombre: 'Centro', direccion: 'Calle Uno',
    telefono: '6141234567', zonaHoraria: 'America/Chihuahua' });
  const servicio = await servicios(db).crear(admin.id, { nombre: 'Consulta', costo: '100.00',
    duracionMinutos: 30 });
  const cuenta = await db.getRepository(Usuario).save({ negocioId: negocio.id,
    nombre: 'Ana', email: `ana-${randomUUID()}@example.test`, passwordHash: 'hash',
    rol: Rol.PROFESIONAL, activo: true, creadoEn: ahora, activadoEn: ahora });
  const perfil = await db.getRepository(Personal).save({ id: cuenta.id, negocioId: negocio.id });
  await new ReservaCorreoService().reservarUsuario(db.manager, { usuarioId: cuenta.id,
    negocioId: negocio.id, correo: cuenta.email });
  await new AuditoriaService().registrar(db.manager, { operacionId: randomUUID(),
    actorUsuarioId: admin.id, negocioId: negocio.id, usuarioId: cuenta.id,
    licenciaId: null, recursoTipo: 'profesional', recursoId: perfil.id,
    accion: 'profesional_creado', valoresAntes: null, valoresDespues: { nombre: 'Ana' } });
  return { negocioId: negocio.id, adminId: admin.id, sedeId: sede.id,
    servicioId: servicio.id, perfilId: perfil.id, cuentaId: cuenta.id };
}

describe('T111–T115 eliminación elegible sin pérdida de historial', () => {
  it('elimina filas sin uso, conserva auditoría técnica y retira cuenta y reserva juntas', async () => {
    await conBaseMigrada(async (db) => {
      const f = await preparar(db);
      await sucursales(db).eliminar(f.adminId, f.sedeId);
      await servicios(db).eliminar(f.adminId, f.servicioId);
      await profesionales(db).eliminar(f.adminId, f.perfilId);
      expect(await db.getRepository(Sucursal).countBy({ id: f.sedeId })).toBe(0);
      expect(await db.getRepository(Servicio).countBy({ id: f.servicioId })).toBe(0);
      expect(await db.getRepository(Personal).countBy({ id: f.perfilId })).toBe(0);
      expect(await db.getRepository(Usuario).countBy({ id: f.cuentaId })).toBe(0);
      expect((await db.query('SELECT COUNT(*) total FROM correos_acceso WHERE usuario_id=?',
        [f.cuentaId]))[0].total).toBe('0');
      const eventos = await db.query(`SELECT accion, usuario_id FROM eventos_auditoria
        WHERE recurso_id IN (?,?,?) AND recurso_tipo IN ('sucursal','servicio','profesional')`,
      [f.sedeId, f.servicioId, f.perfilId]);
      expect(eventos.map((e: { accion: string }) => e.accion)).toEqual(expect.arrayContaining([
        'sucursal_creada', 'servicio_creado', 'profesional_creado',
        'sucursal_eliminada', 'servicio_eliminado', 'profesional_eliminado']));
      expect(eventos.find((e: { accion: string }) => e.accion === 'profesional_creado').usuario_id)
        .toBeNull();
    });
  });

  it('rechaza relaciones e historial operativo; desactivar conserva todas las filas', async () => {
    await conBaseMigrada(async (db) => {
      const f = await preparar(db);
      await db.query(`INSERT INTO personal_sucursales (negocio_id,personal_id,sucursal_id)
        VALUES (?,?,?)`, [f.negocioId, f.perfilId, f.sedeId]);
      await db.query(`INSERT INTO personal_servicios (negocio_id,personal_id,servicio_id)
        VALUES (?,?,?)`, [f.negocioId, f.perfilId, f.servicioId]);
      await expect(sucursales(db).eliminar(f.adminId, f.sedeId))
        .rejects.toBeInstanceOf(ConflictException);
      await expect(servicios(db).eliminar(f.adminId, f.servicioId))
        .rejects.toBeInstanceOf(ConflictException);
      await expect(profesionales(db).eliminar(f.adminId, f.perfilId))
        .rejects.toBeInstanceOf(ConflictException);
      await sucursales(db).desactivar(f.adminId, f.sedeId);
      await servicios(db).cambiarEstado(f.adminId, f.servicioId, false);
      await profesionales(db).cambiarEstado(f.adminId, f.perfilId, false,
        new Date('2026-10-02T12:00:00Z'));
      expect(await db.getRepository(Personal).countBy({ id: f.perfilId })).toBe(1);
      expect(await db.getRepository(Usuario).countBy({ id: f.cuentaId })).toBe(1);
      expect((await db.query('SELECT COUNT(*) total FROM personal_sucursales'))[0].total).toBe('1');
      expect((await db.query('SELECT COUNT(*) total FROM personal_servicios'))[0].total).toBe('1');
      // Una edición anterior también es historial aunque no queden asignaciones.
      await db.query('DELETE FROM personal_servicios');
      await db.query('DELETE FROM personal_sucursales');
      await expect(servicios(db).eliminar(f.adminId, f.servicioId))
        .rejects.toBeInstanceOf(ConflictException);
    });
  });

  it('serializa bajas frente a nuevas asignaciones desde dos conexiones', async () => {
    await conBaseMigrada(async (db, otra) => {
      const f = await preparar(db);
      const resultados = await Promise.allSettled([
        sucursales(db).eliminar(f.adminId, f.sedeId),
        otra.query(`INSERT INTO personal_sucursales (negocio_id,personal_id,sucursal_id)
          VALUES (?,?,?)`, [f.negocioId, f.perfilId, f.sedeId]),
      ]);
      expect(resultados.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
      const sedeExiste = await db.getRepository(Sucursal).countBy({ id: f.sedeId });
      const relacionExiste = Number((await db.query(`SELECT COUNT(*) total FROM personal_sucursales
        WHERE sucursal_id=?`, [f.sedeId]))[0].total);
      expect(sedeExiste === 0 ? relacionExiste === 0 : relacionExiste === 1).toBe(true);
      const borrados = await db.query(`SELECT COUNT(*) total FROM eventos_auditoria
        WHERE recurso_tipo='sucursal' AND recurso_id=? AND accion='sucursal_eliminada'`,
      [f.sedeId]);
      expect(Number(borrados[0].total)).toBe(sedeExiste === 0 ? 1 : 0);
    });
  });

  it('conserva el uso histórico tras retirar una asignación o selección', async () => {
    await conBaseMigrada(async (db) => {
      const f = await preparar(db);
      await profesionales(db).asignarSucursales(f.adminId, f.perfilId,
        { sucursalIds: [f.sedeId] });
      await profesionales(db).seleccionarServicios(f.adminId, f.perfilId,
        { servicioIds: [f.servicioId] });
      await profesionales(db).asignarSucursales(f.adminId, f.perfilId,
        { sucursalIds: [] });
      await profesionales(db).seleccionarServicios(f.adminId, f.perfilId,
        { servicioIds: [] });
      expect((await db.query('SELECT COUNT(*) total FROM personal_sucursales'))[0].total).toBe('0');
      expect((await db.query('SELECT COUNT(*) total FROM personal_servicios'))[0].total).toBe('0');
      await expect(sucursales(db).eliminar(f.adminId, f.sedeId))
        .rejects.toBeInstanceOf(ConflictException);
      await expect(servicios(db).eliminar(f.adminId, f.servicioId))
        .rejects.toBeInstanceOf(ConflictException);
    });
  });
});
