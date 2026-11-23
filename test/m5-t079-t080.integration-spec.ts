import type { DataSource } from 'typeorm';
import { ArrendamientoWhatsappService } from '../src/automatizaciones/arrendamiento-whatsapp.service';
import { EfectoInicialService } from '../src/automatizaciones/efecto-inicial.service';
import { EnvioWhatsapp } from '../src/automatizaciones/entities/envio-whatsapp.entity';
import { CondicionConfirmacionCita } from '../src/automatizaciones/entities/condicion-confirmacion-cita.entity';
import { ProcesadorWhatsappService } from '../src/automatizaciones/procesador-whatsapp.service';
import { TransporteWhatsappControlado, type TransporteWhatsapp } from '../src/automatizaciones/transporte-whatsapp';
import { Cita } from '../src/disponibilidad/entities/cita.entity';
import { PoliticaAccesoLicenciaService } from '../src/licencias/services/politica-acceso-licencia.service';
import { conBaseOperativa, crearEscenarioOperativo } from './support/operacion-fase-5';
import { RelojPrueba } from './support/reloj';

const ahora = new Date('2026-11-23T12:00:00Z');
const transitorio = { estado: 'rechazado', transitorio: true } as const;

async function preparar(db: DataSource) {
  const reloj = new RelojPrueba(ahora);
  const { negocios: [negocio] } = await crearEscenarioOperativo(db, reloj);
  await db.query(`INSERT INTO canales_whatsapp (negocio_id, remitente_externo_id, secreto_ref, habilitado)
    VALUES (?, '123456', 'secret://whatsapp/test', 1)`, [negocio.id]);
  const citas = db.getRepository(Cita);
  const cita = await citas.findOneByOrFail({ id: negocio.ocupaciones[0] });
  cita.estado = 'pendiente';
  cita.origen = 'portal_publico';
  cita.inicioUtc = new Date(ahora.getTime() + 48 * 3_600_000);
  cita.finUtc = new Date(cita.inicioUtc.getTime() + 30 * 60_000);
  cita.finOcupacionUtc = new Date(cita.finUtc.getTime() + cita.separacionMinutos * 60_000);
  cita.telefonoContacto = '6141234567';
  await citas.save(cita);
  await db.transaction((manager) => new EfectoInicialService().preparar(manager, cita, ahora, true));
  const envios = db.getRepository(EnvioWhatsapp);
  const inicial = await envios.findOneByOrFail({ citaId: cita.id });
  return { reloj, cita, inicial, envios, leer: () => envios.findOneByOrFail({ id: inicial.id }) };
}

function procesador(db: DataSource, reloj: RelojPrueba, transporte: TransporteWhatsapp) {
  return new ProcesadorWhatsappService(db, reloj, new ArrendamientoWhatsappService(db, reloj),
    new PoliticaAccesoLicenciaService(), transporte, async () => 'accion-sintetica');
}

describe('M5-T079–T080, reintentos y recuperación del envío', () => {
  it('aplica 1 y 5 minutos, amplía por el proveedor y cierra al tercer intento', async () => {
    await conBaseOperativa(async (db) => {
      const { reloj, cita, leer } = await preparar(db);
      const transporte = new TransporteWhatsappControlado(transitorio, { ...transitorio, reintentarEnMs: 420_000 }, transitorio);
      const proceso = procesador(db, reloj, transporte);
      await proceso.ejecutarUna();
      expect(await leer()).toMatchObject({ estado: 'pendiente', intentos: 1,
        proximoIntentoEn: new Date(ahora.getTime() + 60_000), arrendamientoId: null });
      reloj.avanzar(59_999);
      expect(await proceso.ejecutarUna()).toBe(false);
      reloj.avanzar(1);
      await proceso.ejecutarUna();
      expect(await leer()).toMatchObject({ estado: 'pendiente', intentos: 2,
        proximoIntentoEn: new Date(ahora.getTime() + 480_000) });
      reloj.avanzar(419_999);
      expect(await proceso.ejecutarUna()).toBe(false);
      reloj.avanzar(1);
      await proceso.ejecutarUna();
      expect(await leer()).toMatchObject({ estado: 'fallido', intentos: 3 });
      expect(new Set(transporte.solicitudes.map((s) => s.correlacion)).size).toBe(3);
      expect(await proceso.ejecutarUna()).toBe(false);
      expect(await db.manager.findOneByOrFail(CondicionConfirmacionCita, { citaId: cita.id }))
        .toMatchObject({ estadoPolitica: 'seguimiento_manual' });
      expect(await db.manager.findOneByOrFail(Cita, { id: cita.id })).toMatchObject({ estado: 'pendiente', version: cita.version });
    });
  });

  it.each(['permanente', 'utilidad'] as const)('cierra el rechazo %s sin programar otro envío', async (causa) => {
    await conBaseOperativa(async (db) => {
      const { reloj, inicial, envios, leer } = await preparar(db);
      if (causa === 'utilidad') await envios.update(inicial.id, { utilHasta: new Date(ahora.getTime() + 60_000) });
      const transporte = new TransporteWhatsappControlado({ estado: 'rechazado', transitorio: causa === 'utilidad' });
      const proceso = procesador(db, reloj, transporte);
      await proceso.ejecutarUna();
      expect(await leer()).toMatchObject({ estado: 'fallido', intentos: 1, arrendamientoId: null });
      reloj.avanzar(600_000);
      expect(await proceso.ejecutarUna()).toBe(false);
    });
  });

  it('usa cinco minutos como segunda espera mínima', async () => {
    await conBaseOperativa(async (db) => {
      const { reloj, leer } = await preparar(db);
      const proceso = procesador(db, reloj, new TransporteWhatsappControlado(transitorio, { ...transitorio, reintentarEnMs: 30_000 }));
      await proceso.ejecutarUna();
      reloj.avanzar(60_000);
      await proceso.ejecutarUna();
      expect(await leer()).toMatchObject({ estado: 'pendiente', intentos: 2,
        proximoIntentoEn: new Date(ahora.getTime() + 360_000) });
    });
  });

  it.each(['timeout', 'toma vencida'] as const)('conserva la correlación de %s y evita repetir el HTTP', async (caso) => {
    await conBaseOperativa(async (a, b) => {
      const { reloj, leer } = await preparar(a);
      const otroTransporte = new TransporteWhatsappControlado();
      const recuperador = procesador(b, reloj, otroTransporte);
      const enviar = jest.fn(async () => {
        if (caso === 'timeout') throw new Error('espera agotada');
        reloj.avanzar(30_000);
        expect(await recuperador.ejecutarUna()).toBe(true);
        return { estado: 'aceptado', referencia: 'wamid.tardio' } as const;
      });
      await procesador(a, reloj, { enviar }).ejecutarUna();
      expect(await leer()).toMatchObject({ estado: 'incierto', intentos: 1, referenciaExterna: null,
        arrendamientoId: null, inicioTransporteEn: null, correlacionProveedor: expect.any(String) });
      reloj.avanzar(600_000);
      expect(await recuperador.ejecutarUna()).toBe(false);
      expect(otroTransporte.solicitudes).toHaveLength(0);
      expect(enviar).toHaveBeenCalledTimes(1);
    });
  });
});
