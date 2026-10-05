import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { AuditoriaService } from '../src/auditoria/auditoria.service';
import { EventoAuditoria } from '../src/auditoria/entities/evento-auditoria.entity';
import { Rol } from '../src/auth/enums/rol.enum';
import { AutorizacionService } from '../src/auth/services/autorizacion.service';
import { Licencia } from '../src/licencias/entities/licencia.entity';
import { LicenciasService } from '../src/licencias/licencias.service';
import { CalendarioLicenciasService } from '../src/licencias/services/calendario-licencias.service';
import { Negocio } from '../src/negocios/entities/negocio.entity';
import { Usuario } from '../src/usuarios/entities/usuario.entity';
import { conBaseMigrada } from './support/mariadb';

async function escenario(db: DataSource) {
  const ahora = new Date(Date.now() + 60_000);
  const actor = await db.getRepository(Usuario).save({
    negocioId: null, nombre: 'Superadmin', email: `${randomUUID()}@example.test`,
    passwordHash: 'hash-de-prueba', rol: Rol.SUPERADMIN, activo: true, activadoEn: ahora,
  });
  const negocio = await db.getRepository(Negocio).save({
    nombre: `Tenant ${randomUUID()}`, slug: `tenant-${randomUUID()}`,
    emailContacto: `${randomUUID()}@example.test`, telefonoContacto: null,
    activadoEn: null,
  });
  const licencia = await db.getRepository(Licencia).save({
    negocioId: negocio.id, habilitadaEn: null, venceEn: null, suspendidaEn: null,
  });
  const habilitadaEn = new Date(Math.max(ahora.getTime(), licencia.creadoEn.getTime() + 1000));
  await db.getRepository(Licencia).update(licencia.id, {
    habilitadaEn, venceEn: new CalendarioLicenciasService().sumarAnios(habilitadaEn),
  });
  return { actor, licencia, ahora: new Date(habilitadaEn.getTime() + 60_000) };
}

function servicio(db: DataSource) {
  return new LicenciasService(db.getRepository(Licencia), new AutorizacionService(),
    new CalendarioLicenciasService(), new AuditoriaService());
}

const conflictoDeVista = () => Object.assign(new Error('Vista de licencia desactualizada'), {
  driverError: { code: 'ER_CHECKREAD', errno: 1020 },
});

describe('Licencias — reintentos de transacción por ER_CHECKREAD', () => {
  it('calcula el aniversario bisiesto en America/Chihuahua', () => {
    const calendario = new CalendarioLicenciasService();
    // 15:30Z equivale a 09:30 del 29 de febrero en Chihuahua.
    const alta = new Date('2024-02-29T15:30:00.123Z');
    expect(calendario.sumarAnios(alta)).toEqual(new Date('2025-02-28T15:30:00.123Z'));
    expect(calendario.sumarAnios(alta, 4)).toEqual(new Date('2028-02-29T15:30:00.123Z'));
  });

  it('congela remanente cero al vencer durante la gracia y no duplica eventos', async () => {
    await conBaseMigrada(async (db) => {
      const { actor, licencia, ahora } = await escenario(db);
      const limite = new Date(ahora.getTime() + 48 * 60 * 60 * 1000);
      // La licencia vence antes del bloqueo programado: su saldo debe quedar en cero.
      await db.getRepository(Licencia).update(licencia.id, {
        venceEn: new Date(limite.getTime() - 1000),
      });
      const licencias = servicio(db);
      await licencias.suspender(actor.id, licencia.id, ahora);
      await licencias.materializarSuspension(actor.id, licencia.id, limite);
      await licencias.materializarSuspension(actor.id, licencia.id, limite);
      const congelada = await db.getRepository(Licencia).findOneByOrFail({ id: licencia.id });
      expect(congelada).toMatchObject({ congeladaEn: limite, remanenteMs: '0' });
      expect(await db.getRepository(EventoAuditoria).countBy({
        licenciaId: licencia.id, accion: 'licencia_congelada',
      })).toBe(1);
      const retorno = new Date(limite.getTime() + 1000);
      await licencias.reactivar(actor.id, licencia.id, retorno);
      expect((await db.getRepository(Licencia).findOneByOrFail({ id: licencia.id })).venceEn)
        .toEqual(retorno);
    });
  });

  it('revierte la renovación completa si falla la auditoría y permite reintentar una sola vez', async () => {
    await conBaseMigrada(async (db) => {
      const { actor, licencia, ahora } = await escenario(db);
      const original = await db.getRepository(Licencia).findOneByOrFail({ id: licencia.id });
      const auditoria = new AuditoriaService();
      const fallo = jest.spyOn(auditoria, 'registrar').mockRejectedValueOnce(new Error('Fallo controlado'));
      const licencias = new LicenciasService(db.getRepository(Licencia),
        new AutorizacionService(), new CalendarioLicenciasService(), auditoria);
      await expect(licencias.renovar(actor.id, licencia.id, ahora)).rejects.toThrow('Fallo controlado');
      expect(await db.getRepository(Licencia).findOneByOrFail({ id: licencia.id }))
        .toMatchObject({ venceEn: original.venceEn, versionVencimiento: original.versionVencimiento });
      expect(await db.getRepository(EventoAuditoria).countBy({
        licenciaId: licencia.id, accion: 'licencia_renovada',
      })).toBe(0);
      fallo.mockRestore();
      await licencias.renovar(actor.id, licencia.id, ahora);
      expect(await db.getRepository(EventoAuditoria).countBy({
        licenciaId: licencia.id, accion: 'licencia_renovada',
      })).toBe(1);
    });
  });
  it('repite la transacción completa y registra una sola suspensión después del conflicto', async () => {
    await conBaseMigrada(async (db) => {
      const { actor, licencia, ahora } = await escenario(db);
      // El primer BEGIN falla; el segundo debe ser una transacción nueva y real.
      const transaccion = jest.spyOn(db.manager, 'transaction')
        .mockRejectedValueOnce(conflictoDeVista());
      try {
        await servicio(db).suspender(actor.id, licencia.id, ahora);
        expect(transaccion).toHaveBeenCalledTimes(2);
      } finally {
        transaccion.mockRestore();
      }
      expect(await db.getRepository(Licencia).findOneByOrFail({ id: licencia.id }))
        // La solicitud inicia 48 horas de gracia, no una suspensión inmediata.
        .toMatchObject({ suspendidaEn: null, suspensionSolicitadaEn: ahora,
          bloqueoProgramadoEn: new Date(ahora.getTime() + 48 * 60 * 60 * 1000) });
      expect(await db.getRepository(EventoAuditoria).countBy({
        licenciaId: licencia.id, accion: 'licencia_suspendida',
      })).toBe(1);
    });
  });

  it('limita los conflictos repetidos y no reintenta errores ajenos', async () => {
    await conBaseMigrada(async (db) => {
      const { actor, licencia, ahora } = await escenario(db);
      const transaccion = jest.spyOn(db.manager, 'transaction')
        .mockRejectedValue(conflictoDeVista());
      try {
        await expect(servicio(db).suspender(actor.id, licencia.id, ahora))
          .rejects.toMatchObject({ driverError: { code: 'ER_CHECKREAD' } });
        expect(transaccion).toHaveBeenCalledTimes(3);
        transaccion.mockReset().mockRejectedValue(new Error('Fallo de auditoría'));
        await expect(servicio(db).suspender(actor.id, licencia.id, ahora))
          .rejects.toThrow('Fallo de auditoría');
        expect(transaccion).toHaveBeenCalledTimes(1);
      } finally {
        transaccion.mockRestore();
      }
      expect((await db.getRepository(Licencia).findOneByOrFail({ id: licencia.id })).suspendidaEn)
        .toBeNull();
      expect(await db.getRepository(EventoAuditoria).count()).toBe(0);
    });
  });
});
