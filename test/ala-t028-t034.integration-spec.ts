import { randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { AuditoriaService } from '../src/auditoria/auditoria.service';
import { EventoAuditoria } from '../src/auditoria/entities/evento-auditoria.entity';
import { Rol } from '../src/auth/enums/rol.enum';
import { AutorizacionService } from '../src/auth/services/autorizacion.service';
import { Licencia } from '../src/licencias/entities/licencia.entity';
import { OperacionLicencia } from '../src/licencias/entities/operacion-licencia.entity';
import { LicenciasService } from '../src/licencias/licencias.service';
import { CalendarioLicenciasService } from '../src/licencias/services/calendario-licencias.service';
import { PoliticaAccesoLicenciaService, EstadoAccesoLicencia } from '../src/licencias/services/politica-acceso-licencia.service';
import { Negocio } from '../src/negocios/entities/negocio.entity';
import { Usuario } from '../src/usuarios/entities/usuario.entity';
import { conBaseMigrada } from './support/mariadb';

const dia = 24 * 60 * 60 * 1000;
const instante = new Date('2026-11-01T18:00:00.000Z');
const clave = (nombre: string) => `ala-${nombre}-1234567890123456`;

async function escenario(db: DataSource, diasVigentes = 90) {
  const actor = await db.getRepository(Usuario).save({
    negocioId: null, nombre: 'Superadmin', email: `${randomUUID()}@example.test`,
    passwordHash: 'hash-de-prueba', rol: Rol.SUPERADMIN, activo: true,
    activadoEn: instante,
  });
  const negocio = await db.getRepository(Negocio).save({
    nombre: `Negocio ${randomUUID()}`, slug: `ala-${randomUUID()}`,
    emailContacto: `${randomUUID()}@example.test`, telefonoContacto: null,
    activadoEn: instante,
  });
  const licencia = await db.getRepository(Licencia).save({ negocioId: negocio.id,
    habilitadaEn: null, venceEn: null, suspendidaEn: null });
  // La licencia creada debe satisfacer el CHECK de habilitación anterior al vencimiento.
  await db.getRepository(Licencia).update(licencia.id, { habilitadaEn: instante,
    venceEn: new Date(instante.getTime() + diasVigentes * dia) });
  return { actor, licencia, negocio, servicio: new LicenciasService(
    db.getRepository(Licencia), new AutorizacionService(),
    new CalendarioLicenciasService(), new AuditoriaService()) };
}

describe('ALA-T029–T034: operaciones durables de licencia', () => {
  it('reconoce el mismo comando y rechaza otra acción o contenido con su clave', async () => {
    await conBaseMigrada(async (db) => {
      const { actor, licencia, servicio } = await escenario(db);
      const id = licencia.id;
      const primero = await servicio.suspender(actor.id, id, instante, clave('suspender'), 2);
      const repetido = await servicio.suspender(actor.id, id,
        new Date(instante.getTime() + dia), clave('suspender'), 2);
      expect(repetido).toEqual(primero);
      await expect(servicio.suspender(actor.id, id, instante, clave('suspender'), 3))
        .rejects.toBeInstanceOf(ConflictException);
      await expect(servicio.renovar(actor.id, id, instante, clave('suspender')))
        .rejects.toBeInstanceOf(ConflictException);
      expect(await db.getRepository(OperacionLicencia).countBy({ licenciaId: id })).toBe(1);
      expect(await db.getRepository(EventoAuditoria).countBy({ licenciaId: id })).toBe(1);
    });
  });

  it('renueva una sola anualidad por clave y otra con clave nueva', async () => {
    await conBaseMigrada(async (db) => {
      const { actor, licencia, servicio } = await escenario(db);
      const inicial = (await db.getRepository(Licencia).findOneByOrFail({ id: licencia.id })).venceEn!;
      await servicio.renovar(actor.id, licencia.id, instante, clave('renovar-1'));
      await servicio.renovar(actor.id, licencia.id, instante, clave('renovar-1'));
      const primera = (await db.getRepository(Licencia).findOneByOrFail({ id: licencia.id })).venceEn!;
      expect(primera).toEqual(new CalendarioLicenciasService().sumarAnios(inicial));
      await servicio.renovar(actor.id, licencia.id, instante, clave('renovar-2'));
      expect((await db.getRepository(Licencia).findOneByOrFail({ id: licencia.id })).venceEn)
        .toEqual(new CalendarioLicenciasService().sumarAnios(primera));
      expect(await db.getRepository(OperacionLicencia).countBy({ licenciaId: licencia.id })).toBe(2);
    });
  });

  it.each([0, 2, 30])('programa plazo %i sin permitir sustituirlo', async (plazo) => {
    await conBaseMigrada(async (db) => {
      const { actor, licencia, servicio } = await escenario(db);
      await servicio.suspender(actor.id, licencia.id, instante, clave(`plazo-${plazo}`), plazo);
      const guardada = await db.getRepository(Licencia).findOneByOrFail({ id: licencia.id });
      expect(guardada.plazoSuspensionDias).toBe(plazo);
      expect(guardada.bloqueoProgramadoEn).toEqual(new Date(instante.getTime() + plazo * dia));
      await expect(servicio.suspender(actor.id, licencia.id, instante,
        clave(`otro-plazo-${plazo}`), 1)).rejects.toBeInstanceOf(ConflictException);
      expect(await db.getRepository(OperacionLicencia).countBy({ licenciaId: licencia.id })).toBe(1);
    });
  });

  it('no habilita una licencia pendiente aunque se solicite un plazo largo', async () => {
    await conBaseMigrada(async (db) => {
      const { actor, licencia, servicio } = await escenario(db);
      await db.getRepository(Licencia).update(licencia.id, { habilitadaEn: null, venceEn: null });
      await servicio.suspender(actor.id, licencia.id, instante, clave('pendiente'), 30);
      const guardada = await db.getRepository(Licencia).findOneByOrFail({ id: licencia.id });
      expect(guardada.bloqueoProgramadoEn).toEqual(instante);
      expect(new PoliticaAccesoLicenciaService().estado(guardada, instante))
        .toBe(EstadoAccesoLicencia.PENDIENTE);
      expect(new PoliticaAccesoLicenciaService().puedeActivarAdministrador(guardada, instante))
        .toBe(false);
    });
  });

  it.each([-1, 0, 1])('prioriza límites con vencimiento relativo %i día', async (desfase) => {
    await conBaseMigrada(async (db) => {
      const { actor, licencia, servicio } = await escenario(db, 90);
      const bloqueo = new Date(instante.getTime() + 2 * dia);
      await db.getRepository(Licencia).update(licencia.id, {
        venceEn: new Date(bloqueo.getTime() + desfase * dia),
      });
      await servicio.suspender(actor.id, licencia.id, instante, clave(`prioridad-${desfase}`), 2);
      const politica = new PoliticaAccesoLicenciaService();
      const antes = await db.getRepository(Licencia).findOneByOrFail({ id: licencia.id });
      expect(politica.estado(antes, new Date(Math.min(bloqueo.getTime(), antes.venceEn!.getTime()) - 1)))
        .toBe(EstadoAccesoLicencia.VIGENTE);
      expect(politica.estado(antes, new Date(Math.min(bloqueo.getTime(), antes.venceEn!.getTime()))))
        .not.toBe(EstadoAccesoLicencia.VIGENTE);
      await servicio.materializarSuspension(actor.id, licencia.id, bloqueo);
      const despues = await db.getRepository(Licencia).findOneByOrFail({ id: licencia.id });
      expect(Number(despues.remanenteMs)).toBe(Math.max(0, despues.venceEn!.getTime() - bloqueo.getTime()));
    });
  });

  it('revoca antes del límite sin desplazar vencimiento y repite sin efectos', async () => {
    await conBaseMigrada(async (db) => {
      const { actor, licencia, servicio } = await escenario(db);
      await servicio.suspender(actor.id, licencia.id, instante, clave('susp-revocar'), 2);
      const anterior = (await db.getRepository(Licencia).findOneByOrFail({ id: licencia.id })).venceEn;
      const revocacion = new Date(instante.getTime() + dia);
      const primera = await servicio.reactivar(actor.id, licencia.id, revocacion, clave('revocar'));
      const repetida = await servicio.reactivar(actor.id, licencia.id,
        new Date(revocacion.getTime() + dia), clave('revocar'));
      expect(repetida).toEqual(primera);
      const final = await db.getRepository(Licencia).findOneByOrFail({ id: licencia.id });
      expect(final.venceEn).toEqual(anterior);
      expect(final.bloqueoProgramadoEn).toBeNull();
      expect(await db.getRepository(OperacionLicencia).countBy({ licenciaId: licencia.id })).toBe(2);
      expect(await db.getRepository(EventoAuditoria).countBy({ licenciaId: licencia.id })).toBe(2);
    });
  });

  it('restituye remanente exacto tras renovación sin levantar suspensión', async () => {
    await conBaseMigrada(async (db) => {
      const { actor, licencia, servicio } = await escenario(db);
      await servicio.suspender(actor.id, licencia.id, instante, clave('susp-reactivar'), 0);
      await servicio.materializarSuspension(actor.id, licencia.id, instante);
      const congelada = await db.getRepository(Licencia).findOneByOrFail({ id: licencia.id });
      await servicio.renovar(actor.id, licencia.id, new Date(instante.getTime() + 3 * dia),
        clave('renovar-susp'));
      const renovada = await db.getRepository(Licencia).findOneByOrFail({ id: licencia.id });
      expect(renovada.suspendidaEn).toEqual(instante);
      expect(Number(renovada.remanenteMs)).toBeGreaterThan(Number(congelada.remanenteMs));
      const retorno = new Date(instante.getTime() + 10 * dia);
      await servicio.reactivar(actor.id, licencia.id, retorno, clave('reactivar'));
      const activa = await db.getRepository(Licencia).findOneByOrFail({ id: licencia.id });
      expect(activa.venceEn).toEqual(new Date(retorno.getTime() + Number(renovada.remanenteMs)));
      expect(activa.suspendidaEn).toBeNull();
    });
  });
});
