import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { Rol } from '../src/auth/enums/rol.enum';
import { AutorizacionService } from '../src/auth/services/autorizacion.service';
import { AuditoriaService } from '../src/auditoria/auditoria.service';
import { EventoAuditoria } from '../src/auditoria/entities/evento-auditoria.entity';
import { BandejaCorreoService } from '../src/correos/bandeja-correo.service';
import { EnvioCorreo, EstadoEnvioCorreo, TipoEnvioCorreo } from '../src/correos/entities/envio-correo.entity';
import { ProcesadorCorreoService } from '../src/correos/procesador-correo.service';
import { TransporteCorreoControlado } from '../src/correos/transporte-correo-controlado';
import { DerivadorCodigo } from '../src/codigos/derivador-codigo';
import { Licencia } from '../src/licencias/entities/licencia.entity';
import { OperacionLicencia } from '../src/licencias/entities/operacion-licencia.entity';
import { LicenciasService } from '../src/licencias/licencias.service';
import { CalendarioLicenciasService } from '../src/licencias/services/calendario-licencias.service';
import { Negocio } from '../src/negocios/entities/negocio.entity';
import { Usuario } from '../src/usuarios/entities/usuario.entity';
import { conBaseMigrada } from './support/mariadb';
import { RelojPrueba } from './support/reloj';

const DIA = 86_400_000;
const ahora = new Date('2026-11-01T18:00:00.000Z');
const clave = (nombre: string) => `ala-carrera-${nombre}-1234567890123456`;
const servicio = (db: DataSource) => new LicenciasService(db.getRepository(Licencia),
  new AutorizacionService(), new CalendarioLicenciasService(), new AuditoriaService());

async function escenario(db: DataSource) {
  const correo = `${randomUUID()}@example.test`;
  const actor = await db.getRepository(Usuario).save({ negocioId: null, nombre: 'Superadmin',
    email: `${randomUUID()}@example.test`, passwordHash: 'hash', rol: Rol.SUPERADMIN,
    activo: true, activadoEn: ahora });
  const negocio = await db.getRepository(Negocio).save({ nombre: 'Carreras ALA',
    slug: `ala-${randomUUID()}`, emailContacto: correo, correoAdministrador: correo,
    telefonoContacto: null, activadoEn: ahora });
  await db.getRepository(Usuario).save({ negocioId: negocio.id, nombre: 'Administradora',
    email: correo, passwordHash: 'hash', rol: Rol.ADMIN_NEGOCIO,
    activo: true, activadoEn: ahora });
  const licencia = await db.getRepository(Licencia).save({ negocioId: negocio.id,
    habilitadaEn: ahora, venceEn: new Date(ahora.getTime() + 90 * DIA),
    versionVencimiento: 1, suspendidaEn: null });
  return { actor, negocio, licencia };
}

async function estado(db: DataSource, id: number) {
  return {
    licencia: await db.getRepository(Licencia).findOneByOrFail({ id }),
    auditoria: await db.getRepository(EventoAuditoria).find({ where: { licenciaId: id } }),
    operaciones: await db.getRepository(OperacionLicencia).find({ where: { licenciaId: id } }),
    envios: await db.getRepository(EnvioCorreo).find({ where: { licenciaId: id } }),
  };
}

describe('ALA-T046–T049: atomicidad, correo y carreras', () => {
  it.each(['suspender', 'renovar', 'reactivar'] as const)(
    'revierte %s, auditoría y operación si falla la bandeja', async (accion) => {
      await conBaseMigrada(async (db) => {
        const f = await escenario(db);
        if (accion === 'reactivar') {
          await servicio(db).suspender(f.actor.id, f.licencia.id, ahora, clave('preparar'), 2);
        }
        const antes = await estado(db, f.licencia.id);
        const fallo = jest.spyOn(BandejaCorreoService.prototype, 'encolarEventoLicencia')
          .mockRejectedValueOnce(new Error('Bandeja no disponible'));
        try {
          const operacion = accion === 'suspender'
            ? servicio(db).suspender(f.actor.id, f.licencia.id, ahora, clave(accion), 2)
            : accion === 'renovar'
              ? servicio(db).renovar(f.actor.id, f.licencia.id, ahora, clave(accion))
              : servicio(db).reactivar(f.actor.id, f.licencia.id, ahora, clave(accion));
          await expect(operacion).rejects.toThrow('Bandeja no disponible');
        } finally { fallo.mockRestore(); }
        expect(await estado(db, f.licencia.id)).toEqual(antes);
      });
    });

  it.each(['rechazar', 'timeout'] as const)(
    'conserva bloqueo y reentrega un solo trabajo tras %s SMTP', async (fallo) => {
      await conBaseMigrada(async (db) => {
        const f = await escenario(db);
        const reloj = new RelojPrueba(ahora);
        const transporte = new TransporteCorreoControlado([fallo, 'aceptar']);
        const procesador = new ProcesadorCorreoService(db, transporte, new DerivadorCodigo(), reloj);
        await servicio(db).suspender(f.actor.id, f.licencia.id, ahora, clave(fallo), 0);
        const inicial = await estado(db, f.licencia.id);
        expect((await procesador.procesarUno())?.estado).toBe(EstadoEnvioCorreo.FALLIDO);
        expect((await estado(db, f.licencia.id)).licencia).toEqual(inicial.licencia);
        expect((await procesador.procesarUno())).toBeNull();
        reloj.avanzar(60_000);
        expect((await procesador.procesarUno())?.estado).toBe(EstadoEnvioCorreo.ENVIADO);
        const final = await estado(db, f.licencia.id);
        expect(final.envios).toHaveLength(1);
        expect(final.envios[0].intentos).toBe(2);
        expect(final.envios[0].tipo).toBe(TipoEnvioCorreo.SUSPENSION_INMEDIATA);
        expect(transporte.intentos).toHaveLength(2);
        expect(transporte.intentos.map((m) => m.identidadLogica))
          .toEqual([final.envios[0].id, final.envios[0].id]);
      });
    });

  it('recupera una aceptación SMTP sin acuse local con la misma identidad lógica', async () => {
    await conBaseMigrada(async (db) => {
      const f = await escenario(db);
      const reloj = new RelojPrueba(ahora);
      const transporte = new TransporteCorreoControlado();
      const procesador = new ProcesadorCorreoService(db, transporte, new DerivadorCodigo(), reloj);
      await servicio(db).suspender(f.actor.id, f.licencia.id, ahora, clave('acuse'), 0);
      const toma = await procesador.tomar();
      expect(toma).not.toBeNull();
      // Simula proveedor aceptado y caída del proceso antes de persistir el acuse.
      await transporte.enviar({ destinatario: f.negocio.correoAdministrador!,
        asunto: 'simulación', texto: 'aceptado', identidadLogica: toma!.id });
      reloj.avanzar(300_000);
      await procesador.procesarUno();
      const final = await estado(db, f.licencia.id);
      expect(final.envios).toHaveLength(1);
      expect(final.envios[0].id).toBe(toma!.id);
      expect(final.envios[0].intentos).toBe(2);
      expect(transporte.intentos).toHaveLength(2);
      expect(transporte.intentos[0].identidadLogica).toBe(transporte.intentos[1].identidadLogica);
      expect(transporte.intentos[1].identidadLogica).toBe(toma!.id);
    });
  });

  it.each(['renovar', 'suspender'] as const)(
    'serializa renovación contra suspensión empezando por %s con dos conexiones', async (primera) => {
      await conBaseMigrada(async (db, otra) => {
        const f = await escenario(db);
        let soltar!: () => void;
        let avisar!: () => void;
        const retenido = new Promise<void>((resolver) => { soltar = resolver; });
        const enBandeja = new Promise<void>((resolver) => { avisar = resolver; });
        const espia = jest.spyOn(BandejaCorreoService.prototype, 'encolarEventoLicencia');
        const original = espia.getMockImplementation();
        // La primera transacción retiene negocio y licencia al llegar a la bandeja;
        // la segunda usa otro pool y debe releer ambas filas al obtener el bloqueo.
        espia.mockImplementationOnce(async function (manager, datos) {
          avisar();
          await retenido;
          return original!.call(this, manager, datos);
        });
        const ejecutar = (conexion: DataSource, accion: 'renovar' | 'suspender') =>
          accion === 'renovar'
            ? servicio(conexion).renovar(f.actor.id, f.licencia.id, ahora, clave(`ren-${primera}`))
            : servicio(conexion).suspender(f.actor.id, f.licencia.id, ahora,
              clave(`susp-${primera}`), 2);
        const uno = ejecutar(db, primera);
        try {
          await enBandeja;
          const dos = ejecutar(otra, primera === 'renovar' ? 'suspender' : 'renovar');
          soltar();
          await Promise.all([uno, dos]);
        } finally { soltar(); espia.mockRestore(); }
        const final = await estado(db, f.licencia.id);
        expect(final.licencia.suspensionSolicitadaEn).toEqual(ahora);
        expect(final.licencia.bloqueoProgramadoEn).toEqual(new Date(ahora.getTime() + 2 * DIA));
        expect(final.licencia.venceEn).toEqual(
          new CalendarioLicenciasService().sumarAnios(f.licencia.venceEn!));
        expect(final.auditoria.map((e) => e.accion).sort())
          .toEqual(['licencia_renovada', 'licencia_suspendida']);
        expect(final.operaciones).toHaveLength(2);
        expect(final.envios.map((e) => e.tipo).sort())
          .toEqual([TipoEnvioCorreo.LICENCIA_RENOVADA,
            TipoEnvioCorreo.SUSPENSION_PROGRAMADA].sort());
      });
    });

  it.each(['renovar', 'reactivar'] as const)(
    'serializa renovación contra reactivación empezando por %s con dos conexiones', async (primera) => {
      await conBaseMigrada(async (db, otra) => {
        const f = await escenario(db);
        await servicio(db).suspender(f.actor.id, f.licencia.id, ahora, clave('origen'), 2);
        const bloqueo = new Date(ahora.getTime() + 2 * DIA);
        await servicio(db).materializarSuspension(f.actor.id, f.licencia.id, bloqueo);
        const retorno = new Date(bloqueo.getTime() + DIA);
        let soltar!: () => void;
        let avisar!: () => void;
        const retenido = new Promise<void>((resolver) => { soltar = resolver; });
        const enBandeja = new Promise<void>((resolver) => { avisar = resolver; });
        const espia = jest.spyOn(BandejaCorreoService.prototype, 'encolarEventoLicencia');
        const original = espia.getMockImplementation();
        espia.mockImplementationOnce(async function (manager, datos) {
          avisar();
          await retenido;
          return original!.call(this, manager, datos);
        });
        const ejecutar = (conexion: DataSource, accion: 'renovar' | 'reactivar') =>
          accion === 'renovar'
            ? servicio(conexion).renovar(f.actor.id, f.licencia.id, retorno,
              clave(`ren-retorno-${primera}`))
            : servicio(conexion).reactivar(f.actor.id, f.licencia.id, retorno,
              clave(`reactivar-${primera}`));
        const uno = ejecutar(db, primera);
        try {
          await enBandeja;
          const dos = ejecutar(otra, primera === 'renovar' ? 'reactivar' : 'renovar');
          soltar();
          await Promise.all([uno, dos]);
        } finally { soltar(); espia.mockRestore(); }
        const final = await estado(db, f.licencia.id);
        const anualidad = new CalendarioLicenciasService().sumarAnios(f.licencia.venceEn!);
        expect(final.licencia.venceEn).toEqual(
          new Date(retorno.getTime() + anualidad.getTime() - bloqueo.getTime()));
        expect(final.licencia.suspensionSolicitadaEn).toBeNull();
        expect(final.licencia.remanenteMs).toBeNull();
        expect(final.operaciones).toHaveLength(3);
        expect(final.auditoria.map((e) => e.accion).sort()).toEqual([
          'licencia_congelada', 'licencia_reactivada', 'licencia_renovada',
          'licencia_suspendida'].sort());
        expect(final.envios.filter((e) => e.tipo === TipoEnvioCorreo.LICENCIA_REACTIVADA))
          .toHaveLength(1);
        expect(final.envios.filter((e) => e.tipo === TipoEnvioCorreo.LICENCIA_RENOVADA))
          .toHaveLength(1);
      });
    });
});
