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
        .toMatchObject({ suspendidaEn: ahora });
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
