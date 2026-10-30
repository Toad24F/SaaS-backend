import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { Rol } from '../src/auth/enums/rol.enum';
import { AutorizacionService } from '../src/auth/services/autorizacion.service';
import { AuditoriaService } from '../src/auditoria/auditoria.service';
import { EventoAuditoria } from '../src/auditoria/entities/evento-auditoria.entity';
import { EnvioCorreo, EstadoEnvioCorreo, TipoEnvioCorreo } from '../src/correos/entities/envio-correo.entity';
import { Licencia } from '../src/licencias/entities/licencia.entity';
import { LicenciasService } from '../src/licencias/licencias.service';
import { CalendarioLicenciasService } from '../src/licencias/services/calendario-licencias.service';
import { AvisosVencimientoService } from '../src/licencias/services/avisos-vencimiento.service';
import { BandejaCorreoService } from '../src/correos/bandeja-correo.service';
import { ProcesadorCorreoService } from '../src/correos/procesador-correo.service';
import { TransporteCorreoControlado } from '../src/correos/transporte-correo-controlado';
import { DerivadorCodigo } from '../src/codigos/derivador-codigo';
import { RelojPrueba } from './support/reloj';
import { Negocio } from '../src/negocios/entities/negocio.entity';
import { Usuario } from '../src/usuarios/entities/usuario.entity';
import { conBaseMigrada } from './support/mariadb';

const dia = 86_400_000;
const ahora = new Date('2026-11-01T18:00:00.000Z');
const clave = (nombre: string) => `ala-correo-${nombre}-1234567890123456`;

async function escenario(db: DataSource, diasVigentes = 90) {
  const actor = await db.getRepository(Usuario).save({ negocioId: null,
    nombre: 'Superadmin', email: `${randomUUID()}@example.test`, passwordHash: 'hash',
    rol: Rol.SUPERADMIN, activo: true, activadoEn: ahora });
  const correo = `${randomUUID()}@example.test`;
  const negocio = await db.getRepository(Negocio).save({ nombre: 'Avisos',
    slug: `avisos-${randomUUID()}`, emailContacto: correo,
    correoAdministrador: correo, telefonoContacto: null, activadoEn: ahora });
  await db.getRepository(Usuario).save({ negocioId: negocio.id, nombre: 'Administradora',
    email: correo, passwordHash: 'hash', rol: Rol.ADMIN_NEGOCIO, activo: true,
    activadoEn: ahora });
  const licencia = await db.getRepository(Licencia).save({ negocioId: negocio.id,
    habilitadaEn: ahora, venceEn: new Date(ahora.getTime() + diasVigentes * dia),
    versionVencimiento: 1, suspendidaEn: null });
  return { actor, negocio, licencia, servicio: new LicenciasService(
    db.getRepository(Licencia), new AutorizacionService(),
    new CalendarioLicenciasService(), new AuditoriaService()) };
}

const filas = (db: DataSource, licenciaId: number) => db.getRepository(EnvioCorreo)
  .find({ where: { licenciaId }, order: { id: 'ASC' } });

describe('ALA-T037–T040: bandeja durable de licencias', () => {
  it.each([0, 2])('encola suspensión de plazo %i exactamente una vez', async (plazo) => {
    await conBaseMigrada(async (db) => {
      const { actor, licencia, negocio, servicio } = await escenario(db);
      await servicio.suspender(actor.id, licencia.id, ahora, clave(`susp-${plazo}`), plazo);
      await servicio.suspender(actor.id, licencia.id, new Date(ahora.getTime() + 1000),
        clave(`susp-${plazo}`), plazo);
      const envios = await filas(db, licencia.id);
      expect(envios).toHaveLength(1);
      expect(envios[0]).toMatchObject({ negocioId: negocio.id, correoDestinatario: negocio.correoAdministrador,
        tipo: plazo === 0 ? TipoEnvioCorreo.SUSPENSION_INMEDIATA : TipoEnvioCorreo.SUSPENSION_PROGRAMADA,
        versionSuspension: 1, estado: EstadoEnvioCorreo.PENDIENTE });
      expect(envios[0].versionVencimiento).toBeNull();
    });
  });

  it('encola bloqueo efectivo si precede al vencimiento y no duplica al conciliar', async () => {
    await conBaseMigrada(async (db) => {
      const { actor, licencia, servicio } = await escenario(db);
      await servicio.suspender(actor.id, licencia.id, ahora, clave('programada'), 2);
      const bloqueo = new Date(ahora.getTime() + 2 * dia);
      await servicio.materializarSuspension(actor.id, licencia.id, bloqueo);
      await servicio.materializarSuspension(actor.id, licencia.id, bloqueo);
      const envios = await filas(db, licencia.id);
      expect(envios.filter((e) => e.tipo === TipoEnvioCorreo.SUSPENSION_EFECTIVA)).toHaveLength(1);
      expect(envios.find((e) => e.tipo === TipoEnvioCorreo.SUSPENSION_EFECTIVA)?.versionSuspension)
        .toBe(1);
      expect(await new AvisosVencimientoService(db, new BandejaCorreoService())
        .detectarLimites(new Date(ahora.getTime() + 90 * dia))).toBe(0);
    });
  });

  it.each([-1, 0])('vence %i día respecto al bloqueo y omite aviso efectivo', async (desfase) => {
    await conBaseMigrada(async (db) => {
      const { actor, licencia, servicio } = await escenario(db);
      const bloqueo = new Date(ahora.getTime() + 2 * dia);
      await db.getRepository(Licencia).update(licencia.id, {
        venceEn: new Date(bloqueo.getTime() + desfase * dia) });
      await servicio.suspender(actor.id, licencia.id, ahora, clave(`vence-${desfase}`), 2);
      // El detector registra el vencimiento antes de que el conciliador llegue tarde.
      const detector = new AvisosVencimientoService(db, new BandejaCorreoService());
      await detector.detectarLimites(new Date(bloqueo.getTime() + dia));
      expect(await detector.detectarLimites(new Date(bloqueo.getTime() + dia))).toBe(0);
      await servicio.materializarSuspension(actor.id, licencia.id, new Date(bloqueo.getTime() + dia));
      const envios = await filas(db, licencia.id);
      expect(envios.filter((e) => e.tipo === TipoEnvioCorreo.LICENCIA_VENCIDA)).toHaveLength(1);
      expect(envios.filter((e) => e.tipo === TipoEnvioCorreo.SUSPENSION_EFECTIVA)).toHaveLength(0);
    });
  });

  it('conserva pendiente un tipo nuevo hasta que exista su preparación de mensaje', async () => {
    await conBaseMigrada(async (db) => {
      const { actor, licencia, servicio } = await escenario(db);
      await servicio.suspender(actor.id, licencia.id, ahora, clave('esperar-plantilla'), 2);
      const transporte = new TransporteCorreoControlado();
      const procesador = new ProcesadorCorreoService(db, transporte,
        new DerivadorCodigo(), new RelojPrueba(ahora));
      expect(await procesador.procesarUno()).toBeNull();
      expect((await filas(db, licencia.id))[0].estado).toBe(EstadoEnvioCorreo.PENDIENTE);
      expect(transporte.intentos).toHaveLength(0);
    });
  });

  it('revoca pendiente y descarta aviso incompatible sin repetir confirmación', async () => {
    await conBaseMigrada(async (db) => {
      const { actor, licencia, servicio } = await escenario(db);
      await servicio.suspender(actor.id, licencia.id, ahora, clave('revocar-origen'), 2);
      await servicio.reactivar(actor.id, licencia.id, new Date(ahora.getTime() + dia), clave('revocar'));
      await servicio.reactivar(actor.id, licencia.id, new Date(ahora.getTime() + dia), clave('revocar'));
      const envios = await filas(db, licencia.id);
      expect(envios.find((e) => e.tipo === TipoEnvioCorreo.SUSPENSION_PROGRAMADA)?.estado)
        .toBe(EstadoEnvioCorreo.DESCARTADO);
      expect(envios.filter((e) => e.tipo === TipoEnvioCorreo.SUSPENSION_REVOCADA)).toHaveLength(1);
    });
  });

  it('revocar después de vencer conserva el aviso natural todavía aplicable', async () => {
    await conBaseMigrada(async (db) => {
      const { actor, licencia, servicio } = await escenario(db);
      const vence = new Date(ahora.getTime() + dia);
      await db.getRepository(Licencia).update(licencia.id, { venceEn: vence });
      await servicio.suspender(actor.id, licencia.id, ahora, clave('revocar-vencida-origen'), 2);
      await new AvisosVencimientoService(db, new BandejaCorreoService()).detectarLimites(vence);
      await servicio.reactivar(actor.id, licencia.id, vence, clave('revocar-vencida'));
      const vencimiento = (await filas(db, licencia.id))
        .find((e) => e.tipo === TipoEnvioCorreo.LICENCIA_VENCIDA);
      expect(vencimiento?.estado).toBe(EstadoEnvioCorreo.PENDIENTE);
      expect((await db.getRepository(Licencia).findOneByOrFail({ id: licencia.id })).venceEn)
        .toEqual(vence);
    });
  });

  it('revierte licencia, operación y auditoría si falla encolar', async () => {
    await conBaseMigrada(async (db) => {
      const { actor, licencia, servicio } = await escenario(db);
      const fallo = jest.spyOn(BandejaCorreoService.prototype, 'encolarEventoLicencia')
        .mockRejectedValueOnce(new Error('Fallo de bandeja de prueba'));
      try {
        await expect(servicio.suspender(actor.id, licencia.id, ahora,
          clave('rollback'), 2)).rejects.toThrow('Fallo de bandeja de prueba');
      } finally { fallo.mockRestore(); }
      expect((await db.getRepository(Licencia).findOneByOrFail({ id: licencia.id }))
        .suspensionSolicitadaEn).toBeNull();
      expect(await db.getRepository(EnvioCorreo).count()).toBe(0);
      expect(await db.getRepository(EventoAuditoria).count()).toBe(0);
    });
  });

  it('reactiva una suspensión efectiva y descarta su aviso pendiente', async () => {
    await conBaseMigrada(async (db) => {
      const { actor, licencia, servicio } = await escenario(db);
      await servicio.suspender(actor.id, licencia.id, ahora, clave('reactivar-origen'), 2);
      const bloqueo = new Date(ahora.getTime() + 2 * dia);
      await servicio.materializarSuspension(actor.id, licencia.id, bloqueo);
      const resultado = await servicio.reactivar(actor.id, licencia.id,
        new Date(bloqueo.getTime() + dia), clave('reactivar'));
      const envios = await filas(db, licencia.id);
      expect(envios.find((e) => e.tipo === TipoEnvioCorreo.SUSPENSION_EFECTIVA)?.estado)
        .toBe(EstadoEnvioCorreo.DESCARTADO);
      expect(envios.filter((e) => e.tipo === TipoEnvioCorreo.LICENCIA_REACTIVADA)).toHaveLength(1);
      expect(resultado.vista.condicionAcceso).toBe(true);
    });
  });

  it.each(['vigente', 'vencida', 'suspendida'])('confirma renovación %s sin levantar suspensión', async (estado) => {
    await conBaseMigrada(async (db) => {
      const { actor, licencia, servicio } = await escenario(db);
      if (estado === 'vencida') {
        await db.getRepository(Licencia).update(licencia.id,
          { venceEn: new Date(ahora.getTime() + 500) });
      }
      if (estado === 'suspendida') {
        await servicio.suspender(actor.id, licencia.id, ahora, clave('susp-renovar'), 0);
        await servicio.materializarSuspension(actor.id, licencia.id, ahora);
      }
      const resultado = await servicio.renovar(actor.id, licencia.id,
        new Date(ahora.getTime() + 1000), clave('renovar'));
      await servicio.renovar(actor.id, licencia.id,
        new Date(ahora.getTime() + 2000), clave('renovar'));
      const envios = await filas(db, licencia.id);
      expect(envios.filter((e) => e.tipo === TipoEnvioCorreo.LICENCIA_RENOVADA)).toHaveLength(1);
      if (estado === 'suspendida') expect(resultado.vista.condicionAcceso).toBe(false);
    });
  });
});
