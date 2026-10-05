import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { conBaseMigrada } from './support/mariadb';
import { RelojPrueba } from './support/reloj';
import { Negocio } from '../src/negocios/entities/negocio.entity';
import { Usuario } from '../src/usuarios/entities/usuario.entity';
import { Licencia } from '../src/licencias/entities/licencia.entity';
import { Rol } from '../src/auth/enums/rol.enum';
import { AuditoriaService } from '../src/auditoria/auditoria.service';
import { AutorizacionService } from '../src/auth/services/autorizacion.service';
import { CalendarioLicenciasService } from '../src/licencias/services/calendario-licencias.service';
import { PoliticaAccesoLicenciaService, EstadoAccesoLicencia } from '../src/licencias/services/politica-acceso-licencia.service';
import { LicenciasService } from '../src/licencias/licencias.service';
import { BandejaCorreoService } from '../src/correos/bandeja-correo.service';
import { ProcesadorCorreoService } from '../src/correos/procesador-correo.service';
import { TransporteCorreoControlado } from '../src/correos/transporte-correo-controlado';
import { AvisosVencimientoService } from '../src/licencias/services/avisos-vencimiento.service';
import { ConciliadorSuspensionesService } from '../src/licencias/services/conciliador-suspensiones.service';
import { EjecucionPeriodicaService } from '../src/operacion/ejecucion-periodica.service';

async function preparar(db: DataSource, venceEn: Date) {
  const ahora = new Date(Date.now() + 120_000);
  const reloj = new RelojPrueba(ahora);
  const negocio = await db.getRepository(Negocio).save({ nombre: 'Ciclos',
    slug: `ciclos-${randomUUID()}`, emailContacto: 'contacto@ciclos.test',
    correoAdministrador: 'admin@ciclos.test', activadoEn: ahora });
  await db.getRepository(Usuario).save({ negocioId: negocio.id, nombre: 'Admin',
    email: 'admin@ciclos.test', passwordHash: 'hash', rol: Rol.ADMIN_NEGOCIO,
    activo: true, activadoEn: ahora });
  const superadmin = await db.getRepository(Usuario).save({ negocioId: null,
    nombre: 'Super', email: `super-${randomUUID()}@ciclos.test`, passwordHash: 'hash',
    rol: Rol.SUPERADMIN, activo: true, activadoEn: ahora });
  const licencia = await db.getRepository(Licencia).save({ negocioId: negocio.id,
    habilitadaEn: ahora, venceEn, versionVencimiento: 1 });
  const licencias = new LicenciasService(db.getRepository(Licencia),
    new AutorizacionService(), new CalendarioLicenciasService(), new AuditoriaService());
  const conciliador = new ConciliadorSuspensionesService(db, licencias);
  const avisos = new AvisosVencimientoService(db, new BandejaCorreoService());
  const transporte = new TransporteCorreoControlado(['rechazar', 'aceptar']);
  const crearEjecutor = () => new EjecucionPeriodicaService(conciliador, avisos,
    new ProcesadorCorreoService(db, transporte, undefined, reloj), reloj, true);
  return { reloj, licencia, superadmin, licencias, conciliador, avisos,
    transporte, crearEjecutor };
}

describe('M1-T121–T122 ciclos y recuperación', () => {
  it('detecta al arrancar y reintenta tras reinicio', async () => {
    await conBaseMigrada(async (db) => {
      const inicio = new Date(Date.now() + 120_000);
      const f = await preparar(db, new Date(inicio.getTime() + 48 * 60 * 60 * 1000));
      const primero = f.crearEjecutor();
      await primero.onApplicationBootstrap();
      await primero.onModuleDestroy();
      expect((await db.query("SELECT estado FROM envios_correo WHERE tipo='aviso_vencimiento'"))[0].estado)
        .toBe('fallido');
      f.reloj.avanzar(60_000);
      const reiniciado = f.crearEjecutor();
      await reiniciado.onApplicationBootstrap();
      await reiniciado.onModuleDestroy();
      expect(f.transporte.intentos).toHaveLength(2);
      expect((await db.query("SELECT estado FROM envios_correo WHERE tipo='aviso_vencimiento'"))[0].estado)
        .toBe('enviado');
    });
  });

  it('recupera un envío tomado sin acuse al vencer el arrendamiento', async () => {
    await conBaseMigrada(async (db) => {
      const inicio = new Date(Date.now() + 120_000);
      const f = await preparar(db, new Date(inicio.getTime() + 48 * 60 * 60 * 1000));
      await f.avisos.detectar(f.reloj.ahora());
      // Simula la caída después de tomar el trabajo y antes de llamar a SMTP.
      const tomado = await new ProcesadorCorreoService(db, f.transporte, undefined, f.reloj).tomar();
      expect(tomado?.estado).toBe('tomado');
      f.reloj.avanzar(300_000);
      const reiniciado = f.crearEjecutor();
      await reiniciado.onApplicationBootstrap();
      await reiniciado.onModuleDestroy();
      expect((await db.query("SELECT estado FROM envios_correo WHERE tipo='aviso_vencimiento'"))[0].estado)
        .toBe('fallido');
      expect(f.transporte.intentos).toHaveLength(1);
    });
  });

  it('bloquea acceso en el límite aunque no corra el ciclo y congela desde esa hora al conciliar tarde', async () => {
    await conBaseMigrada(async (db) => {
      const inicio = new Date(Date.now() + 120_000);
      const f = await preparar(db, new Date(inicio.getTime() + 10 * 24 * 60 * 60 * 1000));
      await f.licencias.suspender(f.superadmin.id, f.licencia.id, f.reloj.ahora());
      const pendiente = await db.getRepository(Licencia).findOneByOrFail({ id: f.licencia.id });
      const limite = pendiente.bloqueoProgramadoEn!;
      const politica = new PoliticaAccesoLicenciaService();
      expect(politica.estado(pendiente, new Date(limite.getTime() - 1)))
        .toBe(EstadoAccesoLicencia.VIGENTE);
      expect(politica.estado(pendiente, limite)).toBe(EstadoAccesoLicencia.SUSPENDIDA);
      f.reloj.fijar(new Date(limite.getTime() + 60_000));
      expect(await f.conciliador.conciliar(f.reloj.ahora())).toBe(1);
      const congelada = await db.getRepository(Licencia).findOneByOrFail({ id: f.licencia.id });
      expect(congelada.congeladaEn).toEqual(limite);
      expect(Number(congelada.remanenteMs)).toBe(f.licencia.venceEn!.getTime() - limite.getTime());
      expect(await f.conciliador.conciliar(f.reloj.ahora())).toBe(0);
      expect((await db.query("SELECT COUNT(*) total FROM eventos_auditoria WHERE accion='licencia_congelada'"))[0].total)
        .toBe('1');
    });
  });
});
