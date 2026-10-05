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
import { LicenciasService } from '../src/licencias/licencias.service';
import { BandejaCorreoService } from '../src/correos/bandeja-correo.service';
import { ProcesadorCorreoService } from '../src/correos/procesador-correo.service';
import { TransporteCorreoControlado } from '../src/correos/transporte-correo-controlado';
import { AvisosVencimientoService } from '../src/licencias/services/avisos-vencimiento.service';

async function escenario(db: DataSource, correo = 'admin@avisos.test') {
  const ahora = new Date(Date.now() + 120_000);
  const reloj = new RelojPrueba(ahora);
  const negocio = await db.getRepository(Negocio).save({ nombre: 'Avisos',
    slug: `avisos-${randomUUID()}`, emailContacto: 'contacto@avisos.test',
    correoAdministrador: correo, activadoEn: ahora });
  const admin = await db.getRepository(Usuario).save({ negocioId: negocio.id,
    nombre: 'Admin', email: correo, passwordHash: 'hash',
    rol: Rol.ADMIN_NEGOCIO, activo: true, activadoEn: ahora });
  const superadmin = await db.getRepository(Usuario).save({ negocioId: null,
    nombre: 'Super', email: `super-${randomUUID()}@avisos.test`, passwordHash: 'hash',
    rol: Rol.SUPERADMIN, activo: true, activadoEn: ahora });
  const licencia = await db.getRepository(Licencia).save({ negocioId: negocio.id,
    habilitadaEn: ahora, venceEn: new Date(ahora.getTime() + 48 * 60 * 60 * 1000),
    versionVencimiento: 1 });
  const bandeja = new BandejaCorreoService();
  const detectar = (conexion = db) => new AvisosVencimientoService(conexion, bandeja);
  const transporte = new TransporteCorreoControlado();
  const procesar = (conexion = db, smtp = transporte) =>
    new ProcesadorCorreoService(conexion, smtp, undefined, reloj);
  const licencias = new LicenciasService(db.getRepository(Licencia),
    new AutorizacionService(), new CalendarioLicenciasService(), new AuditoriaService());
  return { reloj, negocio, admin, superadmin, licencia, detectar, procesar,
    transporte, licencias, bandeja };
}

describe('M1-T116–T120 avisos por vencimiento', () => {
  it('detecta en la frontera inclusiva de 48 h, una vez por versión y todavía antes de vencer', async () => {
    await conBaseMigrada(async (db, otra) => {
      const f = await escenario(db);
      f.reloj.fijar(new Date(f.reloj.ahora().getTime() - 1));
      expect(await f.detectar().detectar(f.reloj.ahora())).toBe(0);
      f.reloj.avanzar(1);
      const resultados = await Promise.all([f.detectar().detectar(f.reloj.ahora()),
        f.detectar(otra).detectar(f.reloj.ahora())]);
      expect(resultados.reduce((a, b) => a + b, 0)).toBe(1);
      expect(await f.detectar().detectar(f.reloj.ahora())).toBe(0);
      const envios = await db.query("SELECT * FROM envios_correo WHERE tipo='aviso_vencimiento'");
      expect(envios).toHaveLength(1);
      expect(envios[0]).toMatchObject({ correo_destinatario: f.admin.email,
        version_vencimiento: 1 });
      expect(await f.procesar().procesarUno()).toMatchObject({ estado: 'enviado' });
      expect(f.transporte.intentos).toHaveLength(1);
      expect(f.transporte.intentos[0].texto).toContain(f.licencia.venceEn!.toISOString());
      expect(await f.procesar().procesarUno()).toBeNull();
    });
  });

  it('reintenta fallos mientras hay vigencia y descarta al vencer o cambiar destinatario', async () => {
    await conBaseMigrada(async (db) => {
      const f = await escenario(db);
      const smtp = new TransporteCorreoControlado(['rechazar', 'aceptar']);
      await f.detectar().detectar(f.reloj.ahora());
      expect(await f.procesar(db, smtp).procesarUno()).toMatchObject({ estado: 'fallido' });
      f.reloj.avanzar(60_000);
      expect(await f.procesar(db, smtp).procesarUno()).toMatchObject({ estado: 'enviado' });
      expect(smtp.intentos).toHaveLength(2);
      await db.query("UPDATE envios_correo SET estado='pendiente', confirmado_en=NULL");
      f.reloj.fijar(f.licencia.venceEn!);
      expect(await f.procesar().procesarUno()).toMatchObject({ estado: 'descartado' });
      expect(f.transporte.intentos).toHaveLength(0);
    });
  });

  it('renovar y suspender efectivamente invalidan pendientes; reactivar crea otra versión', async () => {
    await conBaseMigrada(async (db) => {
      const f = await escenario(db);
      await f.detectar().detectar(f.reloj.ahora());
      await f.licencias.renovar(f.superadmin.id, f.licencia.id, f.reloj.ahora());
      expect((await db.query("SELECT estado FROM envios_correo WHERE tipo='aviso_vencimiento'"))[0].estado)
        .toBe('descartado');
      expect(await f.procesar().procesarUno()).toBeNull();
      // Se aproxima el nuevo vencimiento sin alterar su versión.
      const renovada = await db.getRepository(Licencia).findOneByOrFail({ id: f.licencia.id });
      f.reloj.fijar(new Date(renovada.venceEn!.getTime() - 48 * 60 * 60 * 1000));
      expect(await f.detectar().detectar(f.reloj.ahora())).toBe(1);
      await f.licencias.suspender(f.superadmin.id, f.licencia.id, f.reloj.ahora());
      f.reloj.avanzar(48 * 60 * 60 * 1000);
      await f.licencias.materializarSuspension(f.superadmin.id, f.licencia.id, f.reloj.ahora());
      expect(await f.procesar().procesarUno()).toBeNull();
      await f.licencias.reactivar(f.superadmin.id, f.licencia.id, f.reloj.ahora());
      expect((await db.getRepository(Licencia).findOneByOrFail({ id: f.licencia.id }))
        .versionVencimiento).toBeGreaterThan(2);
    });
  });

  it('dos procesadores no entregan dos veces y el destinatario sustituido se descarta', async () => {
    await conBaseMigrada(async (db, otra) => {
      const f = await escenario(db);
      await f.detectar().detectar(f.reloj.ahora());
      const resultados = await Promise.all([f.procesar().procesarUno(),
        f.procesar(otra).procesarUno()]);
      expect(resultados.filter(Boolean)).toHaveLength(1);
      expect(f.transporte.intentos).toHaveLength(1);
      expect(await f.detectar().detectar(f.reloj.ahora())).toBe(0);
      const otro = await escenario(otra, 'otro@avisos.test');
      await otro.detectar().detectar(otro.reloj.ahora());
      await otra.query("UPDATE negocios SET correo_administrador='nuevo@avisos.test' WHERE id=?",
        [otro.negocio.id]);
      expect(await otro.procesar().procesarUno()).toMatchObject({ estado: 'descartado' });
      expect(otro.transporte.intentos).toHaveLength(0);
    });
  });

  it('recupera detección tardía y rechaza encolar un vencimiento sustituido', async () => {
    await conBaseMigrada(async (db) => {
      const f = await escenario(db);
      f.reloj.avanzar(60 * 60 * 1000);
      expect(await f.detectar().detectar(f.reloj.ahora())).toBe(1);
      await expect(db.transaction((manager) => f.bandeja.encolarAviso(manager,
        { negocioId: f.negocio.id, licenciaId: f.licencia.id, usuarioId: f.admin.id,
          versionVencimiento: 2, ahora: f.reloj.ahora() }))).rejects.toThrow();
      f.reloj.fijar(f.licencia.venceEn!);
      expect(await f.detectar().detectar(f.reloj.ahora())).toBe(0);
    });
  });

  it('cancelar una suspensión durante la gracia cambia versión e invalida el aviso', async () => {
    await conBaseMigrada(async (db) => {
      const f = await escenario(db);
      await f.detectar().detectar(f.reloj.ahora());
      await f.licencias.suspender(f.superadmin.id, f.licencia.id, f.reloj.ahora());
      f.reloj.avanzar(1000);
      await f.licencias.reactivar(f.superadmin.id, f.licencia.id, f.reloj.ahora());
      const licencia = await db.getRepository(Licencia).findOneByOrFail({ id: f.licencia.id });
      expect(licencia.versionVencimiento).toBe(2);
      expect((await db.query("SELECT estado FROM envios_correo WHERE tipo='aviso_vencimiento'"))[0].estado)
        .toBe('descartado');
    });
  });
});
