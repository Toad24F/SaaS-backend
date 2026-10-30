import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { Rol } from '../src/auth/enums/rol.enum';
import { AutorizacionService } from '../src/auth/services/autorizacion.service';
import { AuditoriaService } from '../src/auditoria/auditoria.service';
import { BandejaCorreoService } from '../src/correos/bandeja-correo.service';
import { EnvioCorreo, EstadoEnvioCorreo, TipoEnvioCorreo } from '../src/correos/entities/envio-correo.entity';
import { ProcesadorCorreoService } from '../src/correos/procesador-correo.service';
import { TransporteCorreoControlado } from '../src/correos/transporte-correo-controlado';
import { DerivadorCodigo } from '../src/codigos/derivador-codigo';
import { Licencia } from '../src/licencias/entities/licencia.entity';
import { LicenciasService } from '../src/licencias/licencias.service';
import { AvisosVencimientoService } from '../src/licencias/services/avisos-vencimiento.service';
import { CalendarioLicenciasService } from '../src/licencias/services/calendario-licencias.service';
import { ConciliadorSuspensionesService } from '../src/licencias/services/conciliador-suspensiones.service';
import { Negocio } from '../src/negocios/entities/negocio.entity';
import { Usuario } from '../src/usuarios/entities/usuario.entity';
import { EjecucionPeriodicaService } from '../src/operacion/ejecucion-periodica.service';
import { conBaseMigrada } from './support/mariadb';
import { RelojPrueba } from './support/reloj';

const DIA = 86_400_000;
const inicio = () => new Date(Date.now() + 60_000);
const clave = (valor: string) => `ala-avisos-${valor}-1234567890123456`;

async function escenario(db: DataSource, diasVigencia = 20) {
  const ahora = inicio();
  const correo = `${randomUUID()}@example.test`;
  const actor = await db.getRepository(Usuario).save({ negocioId: null,
    nombre: 'Superadmin', email: `${randomUUID()}@example.test`, passwordHash: 'hash',
    rol: Rol.SUPERADMIN, activo: true, activadoEn: ahora });
  const negocio = await db.getRepository(Negocio).save({ nombre: 'Avisos ALA',
    slug: `avisos-${randomUUID()}`, emailContacto: correo, correoAdministrador: correo,
    telefonoContacto: null, activadoEn: ahora });
  await db.getRepository(Usuario).save({ negocioId: negocio.id,
    nombre: 'Administradora', email: correo, passwordHash: 'hash',
    rol: Rol.ADMIN_NEGOCIO, activo: true, activadoEn: ahora });
  const licencia = await db.getRepository(Licencia).save({ negocioId: negocio.id,
    habilitadaEn: ahora, venceEn: new Date(ahora.getTime() + diasVigencia * DIA),
    versionVencimiento: 1, suspendidaEn: null });
  const reloj = new RelojPrueba(ahora);
  const transporte = new TransporteCorreoControlado();
  const bandeja = new BandejaCorreoService();
  const avisos = new AvisosVencimientoService(db, bandeja);
  const licencias = new LicenciasService(db.getRepository(Licencia),
    new AutorizacionService(), new CalendarioLicenciasService(), new AuditoriaService());
  const procesador = new ProcesadorCorreoService(db, transporte, new DerivadorCodigo(), reloj);
  return { actor, negocio, licencia, reloj, transporte, bandeja, avisos, licencias, procesador };
}

const envios = (db: DataSource, licenciaId: number) => db.getRepository(EnvioCorreo)
  .find({ where: { licenciaId }, order: { id: 'ASC' } });

describe('ALA-T041–T045: selección, mensajes y ciclo', () => {
  it('elige 15 y 7 en los límites inclusivos, sin crear ventana de dos días', async () => {
    await conBaseMigrada(async (db) => {
      const f = await escenario(db);
      const vence = f.licencia.venceEn!;
      f.reloj.fijar(new Date(vence.getTime() - 15 * DIA - 1));
      expect(await f.avisos.detectar(f.reloj.ahora())).toBe(0);
      f.reloj.avanzar(1);
      expect(await f.avisos.detectar(f.reloj.ahora())).toBe(1);
      expect((await envios(db, f.licencia.id))[0]).toMatchObject({
        tipo: TipoEnvioCorreo.AVISO_PREVENTIVO, umbralDias: 15 });
      f.reloj.fijar(new Date(vence.getTime() - 7 * DIA - 1));
      expect(await f.avisos.detectar(f.reloj.ahora())).toBe(0);
      f.reloj.avanzar(1);
      expect(await f.avisos.detectar(f.reloj.ahora())).toBe(1);
      f.reloj.fijar(new Date(vence.getTime() - 2 * DIA));
      expect(await f.avisos.detectar(f.reloj.ahora())).toBe(0);
      expect((await envios(db, f.licencia.id)).map((e) => e.umbralDias)).toEqual([15, 7]);
    });
  });

  it('descarta el 15 pendiente a seis días y comunica el tiempo restante real', async () => {
    await conBaseMigrada(async (db) => {
      const f = await escenario(db);
      const vence = f.licencia.venceEn!;
      f.reloj.fijar(new Date(vence.getTime() - 15 * DIA));
      await f.avisos.detectar(f.reloj.ahora());
      f.reloj.fijar(new Date(vence.getTime() - 6 * DIA));
      await f.avisos.detectar(f.reloj.ahora());
      const filas = await envios(db, f.licencia.id);
      expect(filas.map((e) => [e.umbralDias, e.estado]))
        .toEqual([[15, EstadoEnvioCorreo.DESCARTADO], [7, EstadoEnvioCorreo.PENDIENTE]]);
      await f.procesador.procesarUno();
      expect(f.transporte.intentos).toHaveLength(1);
      expect(f.transporte.intentos[0].texto).toContain('6 días');
      expect(f.transporte.intentos[0].texto).toContain(vence.toISOString());
    });
  });

  it('prepara suspensión y reactivación con destinatario y fechas vigentes', async () => {
    await conBaseMigrada(async (db) => {
      const f = await escenario(db, 90);
      const ahora = f.reloj.ahora();
      await f.licencias.suspender(f.actor.id, f.licencia.id, ahora, clave('suspender'), 2);
      await f.procesador.procesarUno();
      expect(f.transporte.intentos[0]).toMatchObject({ destinatario: f.negocio.correoAdministrador });
      expect(f.transporte.intentos[0].texto).toContain('2 días');
      expect(f.transporte.intentos[0].texto).toContain(
        new Date(ahora.getTime() + 2 * DIA).toISOString());
      f.reloj.fijar(new Date(ahora.getTime() + 2 * DIA));
      await f.licencias.materializarSuspension(f.actor.id, f.licencia.id, f.reloj.ahora());
      await f.procesador.procesarUno();
      expect(f.transporte.intentos[1].texto.toLowerCase()).toContain('suspendida');
      f.reloj.avanzar(DIA);
      await f.licencias.reactivar(f.actor.id, f.licencia.id, f.reloj.ahora(), clave('reactivar'));
      const nueva = (await db.getRepository(Licencia).findOneByOrFail({ id: f.licencia.id })).venceEn!;
      await f.procesador.procesarUno();
      expect(f.transporte.intentos[2].texto).toContain(nueva.toISOString());
    });
  });

  it('descarta confirmación obsoleta y no afirma acceso restaurado tras renovar suspendida', async () => {
    await conBaseMigrada(async (db) => {
      const f = await escenario(db, 90);
      const ahora = f.reloj.ahora();
      await f.licencias.renovar(f.actor.id, f.licencia.id, ahora, clave('renovar-uno'));
      await f.licencias.renovar(f.actor.id, f.licencia.id, ahora, clave('renovar-dos'));
      await f.procesador.procesarUno();
      expect((await envios(db, f.licencia.id)).find((e) => e.tipo === TipoEnvioCorreo.LICENCIA_RENOVADA)
        ?.estado).toBe(EstadoEnvioCorreo.DESCARTADO);
      expect(f.transporte.intentos).toHaveLength(0);
      await f.procesador.procesarUno();
      expect(f.transporte.intentos).toHaveLength(1);
      await f.licencias.suspender(f.actor.id, f.licencia.id, ahora, clave('suspender'), 0);
      await f.licencias.materializarSuspension(f.actor.id, f.licencia.id, ahora);
      await f.licencias.renovar(f.actor.id, f.licencia.id, ahora, clave('renovar-suspendida'));
      // El aviso inmediato puede salir primero; se drena hasta la confirmación.
      for (let i = 0; i < 3; i++) await f.procesador.procesarUno();
      const confirmacion = f.transporte.intentos.find((m) =>
        m.asunto.toLowerCase().includes('renovación') && m.texto.includes('suspendida'));
      expect(confirmacion).toBeDefined();
      expect(confirmacion!.texto.toLowerCase()).not.toContain('acceso restablecido');
    });
  });

  it('descarta una renovación cuyo estado fue sustituido por una suspensión posterior', async () => {
    await conBaseMigrada(async (db) => {
      const f = await escenario(db, 90);
      await f.licencias.renovar(f.actor.id, f.licencia.id, f.reloj.ahora(), clave('renovada'));
      await f.licencias.suspender(f.actor.id, f.licencia.id, f.reloj.ahora(), clave('posterior'), 0);
      // La versión de vencimiento sola no identifica el estado actual del acceso.
      await f.procesador.procesarUno();
      expect(f.transporte.intentos).toHaveLength(0);
      expect((await envios(db, f.licencia.id)).find((e) => e.tipo === TipoEnvioCorreo.LICENCIA_RENOVADA)
        ?.estado).toBe(EstadoEnvioCorreo.DESCARTADO);
    });
  });

  it('entrega suspensión inmediata y vencimiento natural con sus fechas', async () => {
    await conBaseMigrada(async (db) => {
      const inmediata = await escenario(db, 90);
      const tiempo = inmediata.reloj.ahora();
      await inmediata.licencias.suspender(inmediata.actor.id, inmediata.licencia.id,
        tiempo, clave('inmediata'), 0);
      await inmediata.procesador.procesarUno();
      expect(inmediata.transporte.intentos[0].texto).toContain(tiempo.toISOString());
      expect(inmediata.transporte.intentos[0].asunto.toLowerCase()).toContain('inmediata');

      const vencida = await escenario(db, 1);
      vencida.reloj.fijar(vencida.licencia.venceEn!);
      await vencida.avisos.detectarLimites(vencida.reloj.ahora());
      // El procesador compartido puede descartar otro trabajo; se drena la cola.
      for (let i = 0; i < 3; i++) await vencida.procesador.procesarUno();
      expect(vencida.transporte.intentos.find((m) => m.asunto === 'Licencia vencida')?.texto)
        .toContain(vencida.licencia.venceEn!.toISOString());
    });
  });

  it('no envía un ciclo revocado ni a un destinatario sustituido', async () => {
    await conBaseMigrada(async (db) => {
      const f = await escenario(db, 90);
      const tiempo = f.reloj.ahora();
      await f.licencias.suspender(f.actor.id, f.licencia.id,
        tiempo, clave('ciclo-uno'), 2);
      await f.licencias.reactivar(f.actor.id, f.licencia.id,
        tiempo, clave('revocar-uno'));
      await f.licencias.suspender(f.actor.id, f.licencia.id,
        tiempo, clave('ciclo-dos'), 2);
      await db.getRepository(Negocio).update(f.negocio.id,
        { correoAdministrador: 'otro@example.test' });
      for (let i = 0; i < 3; i++) await f.procesador.procesarUno();
      expect(f.transporte.intentos).toHaveLength(0);
      const filas = await envios(db, f.licencia.id);
      expect(filas.find((e) => e.versionSuspension === 1)?.estado)
        .toBe(EstadoEnvioCorreo.DESCARTADO);
      expect(filas.find((e) => e.versionSuspension === 2)?.estado)
        .toBe(EstadoEnvioCorreo.DESCARTADO);
    });
  });

  it('reclama y confirma el trabajo antes de esperar el bloqueo del negocio', async () => {
    await conBaseMigrada(async (db, observador) => {
      const f = await escenario(db, 90);
      await f.licencias.suspender(f.actor.id, f.licencia.id,
        f.reloj.ahora(), clave('orden'), 2);
      let liberar!: () => void;
      let bloqueado!: () => void;
      const barrera = new Promise<void>((resolver) => { liberar = resolver; });
      const listo = new Promise<void>((resolver) => { bloqueado = resolver; });
      const bloqueo = db.transaction('READ COMMITTED', async (manager) => {
        await manager.getRepository(Negocio).createQueryBuilder('negocio')
          .setLock('pessimistic_write').where('negocio.id = :id', { id: f.negocio.id }).getOne();
        bloqueado();
        await barrera;
      });
      await listo;
      const procesamiento = f.procesador.procesarUno();
      try {
        // Mientras la preparación espera negocio, otro lector puede bloquear el envío.
        for (let i = 0; i < 40; i++) {
          const [fila] = await observador.query('SELECT estado FROM envios_correo WHERE licencia_id=?',
            [f.licencia.id]);
          if (fila.estado === EstadoEnvioCorreo.TOMADO) break;
          await new Promise((resolver) => setTimeout(resolver, 25));
        }
        await new Promise((resolver) => setTimeout(resolver, 100));
        await observador.transaction(async (manager) => {
          await manager.query('SET innodb_lock_wait_timeout=1');
          const envio = await manager.getRepository(EnvioCorreo).createQueryBuilder('envio')
            .setLock('pessimistic_write').where('envio.licenciaId = :id',
              { id: f.licencia.id }).getOne();
          expect(envio?.estado).toBe(EstadoEnvioCorreo.TOMADO);
        });
      } finally { liberar(); await bloqueo; await procesamiento; }
      expect(f.transporte.intentos).toHaveLength(1);
    });
  });

  it('el ciclo detecta umbrales y vencimiento una vez, y materializa el bloqueo original tarde', async () => {
    await conBaseMigrada(async (db) => {
      const f = await escenario(db);
      const ciclo = new EjecucionPeriodicaService(
        new ConciliadorSuspensionesService(db, f.licencias), f.avisos,
        f.procesador, f.reloj, false);
      const vence = f.licencia.venceEn!;
      for (const dias of [15, 7, 0]) {
        f.reloj.fijar(new Date(vence.getTime() - dias * DIA));
        await ciclo.ciclo();
        await ciclo.ciclo();
      }
      expect((await envios(db, f.licencia.id)).filter((e) => e.estado === EstadoEnvioCorreo.ENVIADO))
        .toHaveLength(3);
      const otra = await escenario(db, 90);
      const solicitud = otra.reloj.ahora();
      await otra.licencias.suspender(otra.actor.id, otra.licencia.id,
        solicitud, clave('tarde'), 2);
      otra.reloj.fijar(new Date(solicitud.getTime() + 3 * DIA));
      const cicloTardio = new EjecucionPeriodicaService(
        new ConciliadorSuspensionesService(db, otra.licencias), otra.avisos,
        otra.procesador, otra.reloj, false);
      await cicloTardio.ciclo();
      await cicloTardio.ciclo();
      expect((await db.getRepository(Licencia).findOneByOrFail({ id: otra.licencia.id })).congeladaEn)
        .toEqual(new Date(solicitud.getTime() + 2 * DIA));
      expect((await envios(db, otra.licencia.id)).filter((e) =>
        e.tipo === TipoEnvioCorreo.SUSPENSION_EFECTIVA)).toHaveLength(1);
    });
  });
});
