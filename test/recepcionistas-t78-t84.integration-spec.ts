import { ConflictException } from '@nestjs/common';
import { IsNull, DataSource } from 'typeorm';
import { AuditoriaService } from '../src/auditoria/auditoria.service';
import { EventoAuditoria } from '../src/auditoria/entities/evento-auditoria.entity';
import { Sesion } from '../src/auth/entities/sesion.entity';
import { PoliticaContrasenasService } from '../src/auth/services/politica-contrasenas.service';
import { CodigoAcceso } from '../src/codigos/entities/codigo-acceso.entity';
import { Licencia } from '../src/licencias/entities/licencia.entity';
import { Usuario } from '../src/usuarios/entities/usuario.entity';
import { UsuariosService } from '../src/usuarios/usuarios.service';
import { conBaseMigrada } from './support/mariadb';
import { crearActivo, crearSuperadmin, fechaSegura, PASSWORD_T51_T60 } from './support/escenarios-t51-t60';

const nuevaPassword = 'password-nueva-t84';
function usuarios(db: DataSource, auditoria = new AuditoriaService()) {
  return new UsuariosService(db.getRepository(Usuario), new PoliticaContrasenasService(), auditoria);
}
async function sesion(db: DataSource, usuarioId: number, ahora: Date) {
  return db.getRepository(Sesion).save(db.getRepository(Sesion).create({
    usuarioId, creadaEn: new Date(ahora.getTime() - 60_000),
    expiraEn: new Date(ahora.getTime() + 3_540_000), revocadaEn: null,
  }));
}

describe('T78 — acceso persistido y concurrente de recepción', () => {
  it('serializa repeticiones y órdenes opuestas sin duplicar eventos ni restaurar sesiones', async () => {
    await conBaseMigrada(async (primera, segunda) => {
      const inicio = fechaSegura();
      const superadmin = await crearSuperadmin(primera, inicio);
      const tenant = await crearActivo(primera, superadmin.id, inicio);
      const ahora = new Date(inicio.getTime() + 2000);
      const recepcion = await usuarios(primera).crearRecepcionista({
        actorUsuarioId: tenant.administradorId, nombre: 'Recepción concurrente',
        email: 'concurrente-t78@example.test', password: PASSWORD_T51_T60, ahora,
      });
      const sesiones = await Promise.all([sesion(primera, recepcion.id, ahora), sesion(segunda, recepcion.id, ahora)]);
      const identidad = { negocioId: recepcion.negocioId, rol: recepcion.rol,
        nombre: recepcion.nombre, email: recepcion.email, passwordHash: recepcion.passwordHash,
        activadoEn: recepcion.activadoEn };

      // Dos conexiones compiten por el mismo bloqueo de fila: solo una transición escribe.
      await Promise.all([
        usuarios(primera).desactivarRecepcionista(tenant.administradorId, recepcion.id, ahora),
        usuarios(segunda).desactivarRecepcionista(tenant.administradorId, recepcion.id, ahora),
      ]);
      expect(await segunda.getRepository(Usuario).findOneByOrFail({ id: recepcion.id }))
        .toMatchObject({ ...identidad, activo: false });
      expect(await segunda.getRepository(EventoAuditoria).countBy({ accion: 'recepcionista_desactivado' })).toBe(1);
      for (const abierta of sesiones) expect((await segunda.getRepository(Sesion).findOneByOrFail({ id: abierta.id })).revocadaEn).toEqual(ahora);

      await Promise.all([
        usuarios(primera).reactivarRecepcionista(tenant.administradorId, recepcion.id, ahora),
        usuarios(segunda).reactivarRecepcionista(tenant.administradorId, recepcion.id, ahora),
      ]);
      expect(await segunda.getRepository(Usuario).findOneByOrFail({ id: recepcion.id }))
        .toMatchObject({ ...identidad, activo: true });
      expect(await segunda.getRepository(EventoAuditoria).countBy({ accion: 'recepcionista_reactivado' })).toBe(1);
      expect(await segunda.getRepository(Sesion).countBy({ usuarioId: recepcion.id, revocadaEn: IsNull() })).toBe(0);

      // Operaciones opuestas equivalen a un orden serial; el último evento define el estado.
      await Promise.all([
        usuarios(primera).desactivarRecepcionista(tenant.administradorId, recepcion.id, ahora),
        usuarios(segunda).reactivarRecepcionista(tenant.administradorId, recepcion.id, ahora),
      ]);
      const eventos = await segunda.getRepository(EventoAuditoria).find({
        where: { usuarioId: recepcion.id }, order: { id: 'ASC' },
      });
      const transiciones = eventos.filter((e) => e.accion === 'recepcionista_desactivado' || e.accion === 'recepcionista_reactivado');
      expect(transiciones.length).toBeGreaterThanOrEqual(2);
      expect(transiciones.length).toBeLessThanOrEqual(4);
      expect((await segunda.getRepository(Usuario).findOneByOrFail({ id: recepcion.id })).activo)
        .toBe(transiciones.at(-1)?.valoresDespues?.activo);
      for (let i = 1; i < transiciones.length; i++) {
        expect(transiciones[i].valoresAntes?.activo).toBe(transiciones[i - 1].valoresDespues?.activo);
      }
    });
  }, 120_000);

  it('revierte cuenta, todas las sesiones y auditoría al fallar la desactivación', async () => {
    await conBaseMigrada(async (primera, segunda) => {
      const inicio = fechaSegura(); const superadmin = await crearSuperadmin(primera, inicio);
      const tenant = await crearActivo(primera, superadmin.id, inicio);
      const ahora = new Date(inicio.getTime() + 2000);
      const recepcion = await usuarios(primera).crearRecepcionista({
        actorUsuarioId: tenant.administradorId, nombre: 'Rollback T78',
        email: 'rollback-t78@example.test', password: PASSWORD_T51_T60, ahora,
      });
      const sesiones = await Promise.all([sesion(primera, recepcion.id, ahora), sesion(segunda, recepcion.id, ahora)]);
      const auditoria = new AuditoriaService();
      jest.spyOn(auditoria, 'registrar').mockRejectedValueOnce(new Error('Fallo T78'));
      await expect(usuarios(primera, auditoria).desactivarRecepcionista(
        tenant.administradorId, recepcion.id, ahora,
      )).rejects.toThrow('Fallo T78');
      expect((await segunda.getRepository(Usuario).findOneByOrFail({ id: recepcion.id })).activo).toBe(true);
      for (const abierta of sesiones) expect((await segunda.getRepository(Sesion).findOneByOrFail({ id: abierta.id })).revocadaEn).toBeNull();
      expect(await segunda.getRepository(EventoAuditoria).countBy({ accion: 'recepcionista_desactivado' })).toBe(0);
    });
  });
});

describe('T84 — alta y restablecimiento persistidos', () => {
  it('permite una sola alta concurrente con correo normalizado y ninguna escritura parcial', async () => {
    await conBaseMigrada(async (primera, segunda) => {
      const inicio = fechaSegura(); const superadmin = await crearSuperadmin(primera, inicio);
      const tenant = await crearActivo(primera, superadmin.id, inicio);
      const ahora = new Date(inicio.getTime() + 2000);
      const codigosAntes = await primera.getRepository(CodigoAcceso).count();
      const solicitudes = await Promise.allSettled([
        usuarios(primera).crearRecepcionista({ actorUsuarioId: tenant.administradorId,
          nombre: ' Uno ', email: ' DUPLICADA-T84@EXAMPLE.TEST ', password: PASSWORD_T51_T60, ahora }),
        usuarios(segunda).crearRecepcionista({ actorUsuarioId: tenant.administradorId,
          nombre: 'Dos', email: 'duplicada-t84@example.test', password: PASSWORD_T51_T60, ahora }),
      ]);
      expect(solicitudes.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(solicitudes.filter((r) => r.status === 'rejected')).toHaveLength(1);
      expect((solicitudes.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason)
        .toBeInstanceOf(ConflictException);
      const cuenta = await segunda.getRepository(Usuario).findOneByOrFail({ email: 'duplicada-t84@example.test' });
      expect(cuenta).toMatchObject({ negocioId: tenant.negocioId, activo: true, activadoEn: ahora });
      await expect(new PoliticaContrasenasService().comparar(PASSWORD_T51_T60, cuenta.passwordHash!)).resolves.toBe(true);
      expect(await segunda.getRepository(Usuario).countBy({ email: cuenta.email })).toBe(1);
      expect(await segunda.getRepository(EventoAuditoria).countBy({ accion: 'recepcionista_creado' })).toBe(1);
      expect(await segunda.getRepository(CodigoAcceso).count()).toBe(codigosAntes);
      const evento = await segunda.getRepository(EventoAuditoria).findOneByOrFail({ accion: 'recepcionista_creado' });
      expect(JSON.stringify(evento)).not.toMatch(/password|hash|password-segura/i);
    });
  });

  it.each([true, false])('restablece activo=%s y revierte hash/sesiones/estado ante fallo', async (activo) => {
    await conBaseMigrada(async (primera, segunda) => {
      const inicio = fechaSegura(); const superadmin = await crearSuperadmin(primera, inicio);
      const tenant = await crearActivo(primera, superadmin.id, inicio);
      const ahora = new Date(inicio.getTime() + 2000);
      const recepcion = await usuarios(primera).crearRecepcionista({
        actorUsuarioId: tenant.administradorId, nombre: 'Reset T84',
        email: `reset-${activo}-t84@example.test`, password: PASSWORD_T51_T60, ahora,
      });
      await primera.getRepository(Usuario).update(recepcion.id, { activo });
      const licencia = await primera.getRepository(Licencia).findOneByOrFail({ id: tenant.licenciaId });
      const sesiones = await Promise.all([sesion(primera, recepcion.id, ahora), sesion(segunda, recepcion.id, ahora)]);
      const auditoria = new AuditoriaService();
      jest.spyOn(auditoria, 'registrar').mockRejectedValueOnce(new Error('Fallo T84'));
      await expect(usuarios(primera, auditoria).restablecerContrasenaRecepcionista(
        tenant.administradorId, recepcion.id, nuevaPassword, ahora,
      )).rejects.toThrow('Fallo T84');
      const sinCambios = await segunda.getRepository(Usuario).findOneByOrFail({ id: recepcion.id });
      expect(sinCambios).toMatchObject({ activo, passwordHash: recepcion.passwordHash,
        nombre: recepcion.nombre, email: recepcion.email, negocioId: recepcion.negocioId });
      for (const abierta of sesiones) expect((await segunda.getRepository(Sesion).findOneByOrFail({ id: abierta.id })).revocadaEn).toBeNull();
      expect(await segunda.getRepository(EventoAuditoria).countBy({ accion: 'recepcionista_contrasena_restablecida' })).toBe(0);

      await usuarios(segunda).restablecerContrasenaRecepcionista(
        tenant.administradorId, recepcion.id, nuevaPassword, ahora,
      );
      const nueva = await primera.getRepository(Usuario).findOneByOrFail({ id: recepcion.id });
      expect(nueva).toMatchObject({ activo, nombre: recepcion.nombre, email: recepcion.email,
        negocioId: recepcion.negocioId, rol: recepcion.rol, activadoEn: recepcion.activadoEn });
      await expect(new PoliticaContrasenasService().comparar(nuevaPassword, nueva.passwordHash!)).resolves.toBe(true);
      for (const abierta of sesiones) expect((await primera.getRepository(Sesion).findOneByOrFail({ id: abierta.id })).revocadaEn).toEqual(ahora);
      expect(await primera.getRepository(Licencia).findOneByOrFail({ id: tenant.licenciaId }))
        .toMatchObject({ venceEn: licencia.venceEn, suspendidaEn: licencia.suspendidaEn });
      expect(await primera.getRepository(EventoAuditoria).countBy({ accion: 'recepcionista_contrasena_restablecida' })).toBe(1);
    });
  });
});
