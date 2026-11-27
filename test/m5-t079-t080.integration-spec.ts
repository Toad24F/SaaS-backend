import type { DataSource } from 'typeorm';
import { AccionesWhatsappService } from '../src/automatizaciones/acciones-whatsapp.service';
import { ArrendamientoWhatsappService } from '../src/automatizaciones/arrendamiento-whatsapp.service';
import { EfectoInicialService } from '../src/automatizaciones/efecto-inicial.service';
import { EnvioWhatsapp } from '../src/automatizaciones/entities/envio-whatsapp.entity';
import { CondicionConfirmacionCita } from '../src/automatizaciones/entities/condicion-confirmacion-cita.entity';
import { ProcesadorWhatsappService } from '../src/automatizaciones/procesador-whatsapp.service';
import { RecepcionWhatsappService } from '../src/automatizaciones/recepcion-whatsapp.service';
import { extraerRecibosWhatsapp } from '../src/automatizaciones/recibos-whatsapp';
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

function procesador(db: DataSource, reloj: RelojPrueba, transporte: TransporteWhatsapp,
  prepararAccion = async () => 'accion-sintetica') {
  return new ProcesadorWhatsappService(db, reloj, new ArrendamientoWhatsappService(db, reloj),
    new PoliticaAccesoLicenciaService(), transporte, prepararAccion);
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

describe('M5-T101 · Reinicio y persistencia del envío', () => {
  it('retoma el arrendamiento vencido si el primer proceso cayó antes de iniciar el transporte', async () => {
    await conBaseOperativa(async (a, b) => {
      const { reloj, inicial, leer } = await preparar(a);
      const toma = await new ArrendamientoWhatsappService(a, reloj).tomar();
      expect(toma?.id).toBe(inicial.id);
      expect(await leer()).toMatchObject({ estado: 'en_proceso', intentos: 0, inicioTransporteEn: null });
      const transporte = new TransporteWhatsappControlado({ estado: 'aceptado', referencia: 'wamid.retomado' });
      const reiniciado = procesador(b, reloj, transporte);
      expect(await reiniciado.ejecutarUna()).toBe(false);
      reloj.avanzar(30_000);
      expect(await reiniciado.ejecutarUna()).toBe(true);
      expect(transporte.solicitudes).toHaveLength(1);
      expect(await leer()).toMatchObject({ estado: 'aceptado', referenciaExterna: 'wamid.retomado', intentos: 1 });
    });
  });

  it.each([true, false])('conserva el envío aceptado tras reiniciar (falló el commit local: %s)', async (falloLocal) => {
    await conBaseOperativa(async (a, b) => {
      const { reloj, cita, leer } = await preparar(a);
      const transporte = new TransporteWhatsappControlado({ estado: 'aceptado', referencia: 'wamid.reinicio' });
      const primerProceso = procesador(a, reloj, transporte);
      if (falloLocal) {
        // El motor SQL fuerza el rollback después de que el proveedor aceptó la solicitud.
        await a.query(`CREATE TRIGGER m5_t101_falla_aceptacion BEFORE UPDATE ON envios_whatsapp FOR EACH ROW
          BEGIN
            IF NEW.estado = 'aceptado' THEN
              SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fallo persistiendo aceptación';
            END IF;
          END`);
        await expect(primerProceso.ejecutarUna()).rejects.toThrow('fallo persistiendo aceptación');
        await a.query('DROP TRIGGER m5_t101_falla_aceptacion');
        expect(await leer()).toMatchObject({ estado: 'en_proceso', referenciaExterna: null, inicioTransporteEn: ahora });
      } else {
        expect(await primerProceso.ejecutarUna()).toBe(true);
        expect(await leer()).toMatchObject({ estado: 'aceptado', referenciaExterna: 'wamid.reinicio' });
      }
      expect(transporte.solicitudes).toHaveLength(1);
      const correlacion = transporte.solicitudes[0].correlacion;
      expect((await leer()).correlacionProveedor).toBe(correlacion);
      const otroTransporte = new TransporteWhatsappControlado();
      const reiniciado = procesador(b, reloj, otroTransporte);
      reloj.avanzar(30_000);
      expect(await reiniciado.ejecutarUna()).toBe(falloLocal);
      if (falloLocal) expect(await leer()).toMatchObject({ estado: 'incierto', correlacionProveedor: correlacion, intentos: 1 });

      // El acuse tardío resuelve el trabajo con la correlación durable y se puede repetir.
      const secreto = 'secreto-sintetico-m5-t101';
      const recibos = extraerRecibosWhatsapp({ object: 'whatsapp_business_account',
        entry: [{ changes: [{ field: 'messages', value: { metadata: { phone_number_id: '123456' },
          statuses: [{ id: 'wamid.reinicio', status: 'delivered', biz_opaque_callback_data: correlacion,
            timestamp: String(reloj.ahora().getTime() / 1000) }],
        } }] }],
      }, secreto);
      const receptor = new RecepcionWhatsappService(b, reloj, new AccionesWhatsappService(secreto, reloj));
      await receptor.recibir(recibos, secreto);
      await receptor.recibir(recibos, secreto);
      expect(await leer()).toMatchObject({ estado: 'entregado', referenciaExterna: 'wamid.reinicio',
        correlacionProveedor: correlacion, intentos: 1, entregadoEn: reloj.ahora() });
      expect(await reiniciado.ejecutarUna()).toBe(false);
      expect(otroTransporte.solicitudes).toHaveLength(0);
      expect(await b.manager.findOneByOrFail(Cita, { id: cita.id })).toMatchObject({ estado: 'pendiente', version: cita.version });
    });
  });
});

describe('M5-T102 · Licencia y canal antes del despacho', () => {
  it.each(['canal inhabilitado', 'licencia vencida', 'licencia vence durante preparación'] as const)(
    'impide el transporte cuando el acceso cambia: %s', async (causa) => {
      await conBaseOperativa(async (db) => {
        const { reloj, cita, leer } = await preparar(db);
        const venceEn = new Date(ahora.getTime() + 1_000);
        await db.query('UPDATE licencias SET vence_en=? WHERE negocio_id=?', [venceEn, cita.negocioId]);
        if (causa === 'canal inhabilitado') {
          await db.query('UPDATE canales_whatsapp SET habilitado=0 WHERE negocio_id=?', [cita.negocioId]);
        }
        if (causa === 'licencia vencida') reloj.fijar(venceEn);
        const prepararAccion = jest.fn(async () => {
          // La licencia puede vencer mientras el trabajador aún mantiene los locks SQL.
          reloj.fijar(venceEn);
          return 'accion-sintetica';
        });
        const transporte = new TransporteWhatsappControlado();
        expect(await procesador(db, reloj, transporte, prepararAccion).ejecutarUna()).toBe(true);
        expect(prepararAccion).toHaveBeenCalledTimes(causa === 'licencia vence durante preparación' ? 1 : 0);
        expect(transporte.solicitudes).toHaveLength(0);
        expect(await leer()).toMatchObject({ estado: 'fallido', intentos: 0, inicioTransporteEn: null,
          correlacionProveedor: null, ultimoError: 'canal_o_licencia_no_disponible' });
        expect(await db.manager.findOneByOrFail(CondicionConfirmacionCita, { citaId: cita.id }))
          .toMatchObject({ estadoPolitica: 'seguimiento_manual' });
        expect(await db.manager.findOneByOrFail(Cita, { id: cita.id })).toMatchObject({ estado: 'pendiente', version: cita.version });
      });
    });
});
