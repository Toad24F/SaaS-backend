import { randomUUID } from 'node:crypto';
import { AccionesWhatsappService } from '../src/automatizaciones/acciones-whatsapp.service';
import { CancelacionAutomaticaCitasService } from '../src/automatizaciones/cancelacion-automatica-citas.service';
import { EfectoInicialService } from '../src/automatizaciones/efecto-inicial.service';
import { AccionConfirmacion } from '../src/automatizaciones/entities/accion-confirmacion.entity';
import { CanalWhatsapp } from '../src/automatizaciones/entities/canal-whatsapp.entity';
import { CondicionConfirmacionCita } from '../src/automatizaciones/entities/condicion-confirmacion-cita.entity';
import { EnvioWhatsapp } from '../src/automatizaciones/entities/envio-whatsapp.entity';
import { RecepcionWhatsappService } from '../src/automatizaciones/recepcion-whatsapp.service';
import { extraerRecibosWhatsapp } from '../src/automatizaciones/recibos-whatsapp';
import { CambioEstadoCitaService } from '../src/citas/cambio-estado-cita.service';
import { CambioHorarioCitaService } from '../src/citas/cambio-horario-cita.service';
import { IntentosCitaManualService } from '../src/citas/intentos-cita-manual.service';
import { RegistroCitaManualService } from '../src/citas/registro-cita-manual.service';
import { EventoCita } from '../src/citas/entities/evento-cita.entity';
import { Cita } from '../src/disponibilidad/entities/cita.entity';
import { OcupacionesService } from '../src/disponibilidad/ocupaciones.service';
import { CortesReporteService } from '../src/reportes/cortes-reporte.service';
import { Not } from 'typeorm';
import request from 'supertest';
import { Rol } from '../src/auth/enums/rol.enum';
import { situarSesion } from './support/acceso-operativo';
import { conAgendaHttp } from './support/agenda-http';
import { prepararManual, type EscenarioManualHttp } from './support/cita-manual';
import { enfrentarEscritores } from './support/carrera-escritores-m4';

const clave = 'clave-sintetica-de-confirmacion-m5-088-a-093';
const secretoApp = 'secreto-sintetico-m5-088';
const remitente = '123456';
const mensaje = 'wamid.vence-m5';
const inicio = new Date('2026-11-09T15:17:00.000Z');
const destino = { fechaLocal: '2026-11-09', horaInicio: '10:20', version: 1 };
const clavePrevia = process.env.WHATSAPP_CONFIRMACION_HMAC_SECRET;
const claveManualPrevia = process.env.CITAS_MANUALES_HMAC_SECRET;
beforeAll(() => {
  process.env.WHATSAPP_CONFIRMACION_HMAC_SECRET = clave;
  process.env.CITAS_MANUALES_HMAC_SECRET = 'clave-sintetica-cita-manual-m5-t100';
});
afterAll(() => {
  if (clavePrevia === undefined) delete process.env.WHATSAPP_CONFIRMACION_HMAC_SECRET;
  else process.env.WHATSAPP_CONFIRMACION_HMAC_SECRET = clavePrevia;
  if (claveManualPrevia === undefined) delete process.env.CITAS_MANUALES_HMAC_SECRET;
  else process.env.CITAS_MANUALES_HMAC_SECRET = claveManualPrevia;
});

async function preparar(f: EscenarioManualHttp, conAccion = true) {
  const m = await prepararManual(f);
  const id = f.negocios[0].ocupaciones[0];
  const cita = await f.db.getRepository(Cita).findOneByOrFail({ id });
  Object.assign(cita, { inicioUtc: inicio, finUtc: new Date(inicio.getTime() + 1_800_000),
    finOcupacionUtc: new Date(inicio.getTime() + 2_400_000), separacionMinutos: 10,
    estado: 'pendiente', origen: 'portal_publico', costoAceptado: '75.00', nombreServicio: 'Histórico' });
  await f.db.manager.save(Cita, cita);
  const canal = await f.db.manager.save(CanalWhatsapp, { negocioId: cita.negocioId,
    remitenteExternoId: remitente, secretoRef: 'secret://whatsapp/test', habilitado: 1 });
  await f.db.transaction((manager) => new EfectoInicialService().preparar(manager, cita, f.reloj.ahora(), true));
  const condicion = await f.db.manager.findOneByOrFail(CondicionConfirmacionCita, { citaId: id });
  const envio = await f.db.manager.findOneByOrFail(EnvioWhatsapp, { citaId: id });
  const payload = conAccion ? await f.db.transaction((manager) => new AccionesWhatsappService(clave, f.reloj)
    .preparar(manager, envio, cita, condicion, canal, f.reloj.ahora())) : null;
  await f.db.manager.update(EnvioWhatsapp, envio.id, { estado: 'aceptado', referenciaExterna: mensaje,
    aceptadoEn: f.reloj.ahora(), intentos: 1 });
  const recepcion = new RecepcionWhatsappService(f.db, f.reloj, new AccionesWhatsappService(clave, f.reloj));
  const recibir = (valor: object, servicio = recepcion) => servicio.recibir(extraerRecibosWhatsapp({
    object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: {
      metadata: { phone_number_id: remitente }, ...valor,
    } }] }],
  }, secretoApp), secretoApp);
  const plazo = condicion.vencimientoUtc!;
  return { ...m, cita, condicion, envio, plazo, payload, recibir,
    cancelar: f.app.get(CancelacionAutomaticaCitasService),
    cambiar: (estado: string, version: number) => f.app.get(CambioEstadoCitaService)
      .cambiar(m.identidad, String(id), { estado, version }),
    leer: () => f.db.manager.findOneByOrFail(Cita, { id }),
    condiciones: () => f.db.manager.find(CondicionConfirmacionCita, { where: { citaId: id }, order: { generacion: 'ASC' } }),
    envios: () => f.db.manager.find(EnvioWhatsapp, { where: { citaId: id }, order: { id: 'ASC' } }),
    eventos: () => f.db.manager.find(EventoCita, { where: { citaId: id }, order: { versionResultante: 'ASC' } }),
    ocupaciones: () => f.db.transaction('READ COMMITTED', (manager) => f.app.get(OcupacionesService).consultar({
      manager, negocioId: cita.negocioId, personalId: cita.personalId, ahora: f.reloj.ahora(),
    }, inicio, new Date(inicio.getTime() + 2_400_000))),
    acuse: (horaProveedor = f.reloj.ahora()) => recibir({ statuses: [{ id: mensaje, status: 'read',
      timestamp: String(Math.floor(horaProveedor.getTime() / 1000)) }] }),
  };
}

type CitaDePrueba = Awaited<ReturnType<typeof preparar>>;
const esperaNegocio = { tablaEspera: 'negocios', pausarEn: (sql: string) => /^UPDATE `citas` /i.test(sql) };

async function acreditarLectura(f: EscenarioManualHttp, m: CitaDePrueba) {
  f.reloj.fijar(new Date(m.plazo.getTime() - 1));
  await m.acuse();
}

function pulsarBoton(app: EscenarioManualHttp['app'], m: CitaDePrueba) {
  return m.recibir({ messages: [{ type: 'button', id: 'wamid.boton-carrera', from: '526141234567',
    context: { id: mensaje }, button: { payload: m.payload },
    timestamp: String(Math.floor(m.plazo.getTime() / 1000) - 1) }] }, app.get(RecepcionWhatsappService));
}

describe('M5-T098–T100 · Carreras de ocupación y confirmación', () => {
  it.each([true, false])('T098 serializa el botón y el cancelador (botón primero: %s)', async (botonPrimero) => {
    await conAgendaHttp(async (f) => {
      const m = await preparar(f);
      await acreditarLectura(f, m);
      const confirmar = (app: typeof f.app) => pulsarBoton(app, m);
      const cancelar = (app: typeof f.app) => app.get(CancelacionAutomaticaCitasService).ejecutarLote();
      if (botonPrimero) {
        const carrera = await enfrentarEscritores(f, () => confirmar(f.app), cancelar, {
          ...esperaNegocio, antesSegundo: () => f.reloj.fijar(m.plazo),
        });
        expect(carrera.primero.status).toBe('fulfilled');
        expect(carrera.segundo).toMatchObject({ status: 'fulfilled', value: { canceladas: 0, seguimiento: 0 } });
      } else {
        f.reloj.fijar(m.plazo);
        // La bandeja del botón espera primero por la FK al canal bloqueado por el cancelador.
        const carrera = await enfrentarEscritores(f, () => cancelar(f.app), confirmar, {
          ...esperaNegocio, tablaEspera: 'eventos_whatsapp', patronEspera: 'INSERT INTO%',
        });
        expect(carrera.primero).toMatchObject({ status: 'fulfilled', value: { canceladas: 1 } });
        expect(carrera.segundo.status).toBe('fulfilled');
      }
      const estado = botonPrimero ? 'confirmada' : 'cancelada';
      expect(await m.leer()).toMatchObject({ estado, version: 2 });
      expect(await m.condiciones()).toEqual([expect.objectContaining({ estadoPolitica: estado })]);
      expect(await m.eventos()).toEqual([expect.objectContaining({
        actorTipo: botonPrimero ? 'cliente_whatsapp' : 'sistema', versionResultante: 2,
      })]);
      const accion = await f.db.manager.findOneByOrFail(AccionConfirmacion, { envioId: m.envio.id });
      expect(accion.consumidoEn).toEqual(botonPrimero ? new Date(m.plazo.getTime() - 1) : null);
      expect((await m.ocupaciones()).some((o) => o.tipo === 'cita' && o.id === m.cita.id)).toBe(botonPrimero);
    });
  });

  it.each([true, false])('T099 serializa la reprogramación y el cancelador (movimiento primero: %s)', async (moverPrimero) => {
    await conAgendaHttp(async (f) => {
      const m = await preparar(f);
      await situarSesion(f.db, m.actor, m.plazo);
      await f.db.query(`INSERT INTO configuracion_automatizaciones (negocio_id,version,plazo_confirmacion_horas,recordatorio_horas)
        VALUES (?,1,12,12)`, [m.cita.negocioId]);
      await acreditarLectura(f, m);
      const mover = (app: typeof f.app) => app.get(CambioHorarioCitaService).cambiar(m.identidad, String(m.cita.id), destino);
      const cancelar = (app: typeof f.app) => app.get(CancelacionAutomaticaCitasService).ejecutarLote();
      if (moverPrimero) {
        const carrera = await enfrentarEscritores(f, () => mover(f.app), cancelar, {
          ...esperaNegocio, antesSegundo: () => f.reloj.fijar(m.plazo),
        });
        expect(carrera.primero).toMatchObject({ status: 'fulfilled', value: { version: 2 } });
        expect(carrera.segundo).toMatchObject({ status: 'fulfilled', value: { canceladas: 0, seguimiento: 0 } });
      } else {
        f.reloj.fijar(m.plazo);
        const carrera = await enfrentarEscritores(f, () => cancelar(f.app), mover, esperaNegocio);
        expect(carrera.primero).toMatchObject({ status: 'fulfilled', value: { canceladas: 1 } });
        expect(carrera.segundo).toMatchObject({ status: 'rejected', reason: { status: 409 } });
      }
      const nuevoInicio = new Date('2026-11-09T16:20:00Z');
      expect(await m.leer()).toMatchObject({ estado: moverPrimero ? 'confirmada' : 'cancelada', version: 2,
        inicioUtc: moverPrimero ? nuevoInicio : inicio, generacionAutomatizacion: moverPrimero ? 2 : 1 });
      expect(await m.eventos()).toEqual([expect.objectContaining({ accion: moverPrimero ? 'cambio_horario' : 'cancelacion' })]);
      expect((await m.condiciones())[0].estadoPolitica).toBe(moverPrimero ? 'anulada' : 'cancelada');
      expect(await m.envios()).toEqual(moverPrimero ? [
        expect.objectContaining({ generacion: 1, estado: 'leido' }),
        expect.objectContaining({ generacion: 2, tipo: 'recordatorio', programadoEn: new Date('2026-11-09T04:20:00Z') }),
      ] : [expect.objectContaining({ generacion: 1, estado: 'leido' })]);
      // Reintentar la acción anterior deja intactas la generación y la ocupación que ganaron.
      await pulsarBoton(f.app, m);
      expect((await f.db.manager.findOneByOrFail(AccionConfirmacion, { envioId: m.envio.id })).consumidoEn).toBeNull();
      expect(await m.eventos()).toHaveLength(1);
      expect((await m.ocupaciones()).some((o) => o.tipo === 'cita' && o.id === m.cita.id)).toBe(false);
      const destinoOcupado = await f.db.transaction((manager) => f.app.get(OcupacionesService).consultar({
        manager, negocioId: m.cita.negocioId, personalId: m.cita.personalId, ahora: f.reloj.ahora(),
      }, nuevoInicio, new Date('2026-11-09T17:00:00Z')));
      expect(destinoOcupado.some((o) => o.tipo === 'cita' && o.id === m.cita.id)).toBe(moverPrimero);
    });
  });

  it.each([
    { reactivar: true, gestionPrimero: true }, { reactivar: true, gestionPrimero: false },
    { reactivar: false, gestionPrimero: true }, { reactivar: false, gestionPrimero: false },
  ])('T100 serializa reservas entre sucursales (reactivación: $reactivar, gestión primero: $gestionPrimero)',
    async ({ reactivar, gestionPrimero }) => {
      await conAgendaHttp(async (f) => {
        const m = await preparar(f);
        await acreditarLectura(f, m);
        f.reloj.fijar(m.plazo);
        await situarSesion(f.db, m.actor, m.plazo);
        const segundaSucursal = f.negocios[0].sucursales[1].id;
        // Un horario heredado coincidente fuerza la colisión en las dos sucursales.
        await f.db.query(`INSERT INTO horarios_personal
          (negocio_id,personal_id,dia_semana,orden,sucursal_id,inicio_minutos,fin_minutos,activo)
          VALUES(?,?,1,1,?,480,720,1)`, [m.cita.negocioId, m.cita.personalId, segundaSucursal]);
        if (reactivar) expect(await m.cancelar.ejecutarLote()).toMatchObject({ canceladas: 1 });
        const gestion = async (app: typeof f.app) => reactivar
          ? app.get(CambioEstadoCitaService).cambiar(m.identidad, String(m.cita.id), { estado: 'confirmada', version: 2 })
          : app.get(CancelacionAutomaticaCitasService).ejecutarLote();
        const seleccion = { ...m.seleccion, sucursalId: segundaSucursal };
        const prepararIntento = async () => {
          const llave = randomUUID();
          await f.app.get(IntentosCitaManualService).preparar(m.identidad, llave, seleccion);
          return llave;
        };
        const registrar = (app: typeof f.app, llave: string) =>
          app.get(RegistroCitaManualService).registrar(m.identidad, llave, seleccion);
        const llave = await prepararIntento();
        const reservar = (app: typeof f.app) => registrar(app, llave);
        const opciones = { tablaEspera: reactivar ? 'usuarios' : 'negocios' };
        const carrera = gestionPrimero
          ? await enfrentarEscritores(f, () => gestion(f.app), reservar, opciones)
          : await enfrentarEscritores(f, () => reservar(f.app), gestion, opciones);
        const resultadoGestion = gestionPrimero ? carrera.primero : carrera.segundo;
        const resultadoReserva = gestionPrimero ? carrera.segundo : carrera.primero;
        if (reactivar === gestionPrimero) {
          expect(resultadoGestion.status).toBe('fulfilled');
          expect(resultadoReserva).toMatchObject({ status: 'rejected', reason: { status: 409 } });
        } else {
          expect(resultadoReserva.status).toBe('fulfilled');
          if (reactivar) expect(resultadoGestion).toMatchObject({ status: 'rejected', reason: { status: 409 } });
          else expect(resultadoGestion).toMatchObject({ status: 'fulfilled', value: { canceladas: 1 } });
        }
        if (!reactivar && !gestionPrimero) {
          expect((await m.ocupaciones()).filter((o) => o.tipo === 'cita')).toHaveLength(0);
          await registrar(f.app, await prepararIntento());
        }
        const ocupadas = (await m.ocupaciones()).filter((o) => o.tipo === 'cita');
        expect(ocupadas).toHaveLength(1);
        const ganadora = await f.db.manager.findOneByOrFail(Cita, { id: ocupadas[0].id });
        expect(ganadora).toMatchObject({ inicioUtc: inicio,
          sucursalId: reactivar && gestionPrimero ? m.cita.sucursalId : segundaSucursal });
      });
    });
});

describe('M5-T088–T090 · Cancelación automática y seguimiento', () => {
  it('con lectura antes del límite, dos procesos cancelan una sola vez y liberan solo esa cita', async () => {
    await conAgendaHttp(async (f) => {
      const m = await preparar(f);
      f.reloj.fijar(new Date(m.plazo.getTime() - 1));
      await m.acuse();
      const antes = await m.leer();
      expect(await m.cancelar.ejecutarLote()).toEqual({ canceladas: 0, seguimiento: 0 });
      expect(await m.ocupaciones()).toEqual(expect.arrayContaining([expect.objectContaining({ id: m.cita.id, tipo: 'cita' })]));
      const otras = await f.db.manager.find(Cita, { order: { id: 'ASC' } });
      const apartados = await f.db.query('SELECT * FROM bloqueos_temporales ORDER BY id');
      f.reloj.fijar(m.plazo);
      const otro = new CancelacionAutomaticaCitasService(f.segunda, f.reloj, new AccionesWhatsappService(clave, f.reloj));
      const resultados = await Promise.all([m.cancelar.ejecutarLote(), otro.ejecutarLote()]);
      expect(resultados.reduce((total, fila) => total + fila.canceladas, 0)).toBe(1);
      const cancelada = { ...antes, estado: 'cancelada', causaCancelacion: 'falta_confirmacion_plazo', version: antes.version + 1 };
      expect(await m.leer()).toEqual(cancelada);
      expect(await f.db.manager.find(Cita, { order: { id: 'ASC' } })).toEqual(otras.map((c) => c.id === antes.id ? cancelada : c));
      expect(await f.db.query('SELECT * FROM bloqueos_temporales ORDER BY id')).toEqual(apartados);
      expect((await m.ocupaciones()).some(({ id, tipo }) => id === antes.id && tipo === 'cita')).toBe(false);
      expect((await m.condiciones())[0]).toMatchObject({ estadoPolitica: 'cancelada', vencimientoUtc: m.plazo });
      expect(await m.eventos()).toEqual([expect.objectContaining({ accion: 'cancelacion', actorTipo: 'sistema',
        motivo: 'Falta de confirmación dentro del plazo', ocurridoEn: m.plazo, versionResultante: antes.version + 1 })]);
      await situarSesion(f.db, m.actor, m.plazo);
      expect((await f.agenda.historial(m.identidad, String(antes.id), {})).eventos[0]).toMatchObject({
        origenActor: 'sistema', valoresDespues: { causaCancelacion: 'falta_confirmacion_plazo' },
      });
    });
  });

  it.each(['solo aceptación', 'lectura al límite', 'inicio exacto', 'sin acción', 'canal reemplazado', 'versión sustituida'] as const)(
    'deriva %s a seguimiento terminal y conserva la ocupación ante nuevos acuses', async (caso) => {
      await conAgendaHttp(async (f) => {
        const m = await preparar(f, caso !== 'sin acción');
        if (['inicio exacto', 'sin acción', 'canal reemplazado', 'versión sustituida'].includes(caso)) {
          f.reloj.fijar(new Date(m.plazo.getTime() - 1));
          await m.acuse();
        }
        f.reloj.fijar(caso === 'inicio exacto' ? inicio : m.plazo);
        // Un timestamp favorable de Meta no reemplaza la recepción del servidor.
        if (caso === 'lectura al límite') await m.acuse(new Date(m.plazo.getTime() - 10_000));
        if (caso === 'canal reemplazado') await f.db.manager.update(CanalWhatsapp, m.cita.negocioId, { remitenteExternoId: '234567' });
        if (caso === 'versión sustituida') await f.db.manager.update(Cita, m.cita.id, { version: m.cita.version + 1 });
        const previa = await m.leer();
        expect(await m.cancelar.ejecutarLote()).toEqual({ canceladas: 0, seguimiento: 1 });
        expect((await m.condiciones())[0]).toMatchObject({ estadoPolitica: 'seguimiento_manual', motivoSeguimiento: expect.any(String) });
        await m.acuse();
        expect(await m.cancelar.ejecutarLote()).toEqual({ canceladas: 0, seguimiento: 0 });
        expect(await m.leer()).toEqual(previa);
        expect(await m.eventos()).toHaveLength(0);
        expect((await m.ocupaciones()).some(({ id, tipo }) => id === previa.id && tipo === 'cita')).toBe(true);
      });
    });

  it('limita y ordena el lote por vencimiento; ignora citas confirmadas y generaciones no vigentes', async () => {
    await conAgendaHttp(async (f) => {
      const m = await preparar(f);
      const antes = new Date(m.plazo.getTime() - 60_000);
      const { id: _id, ...base } = m.condicion;
      const noVigente = await f.db.manager.save(CondicionConfirmacionCita, { ...base, generacion: 2, vencimientoUtc: antes });
      const originales = await f.db.manager.find(Cita, { where: { negocioId: m.cita.negocioId, id: Not(m.cita.id) },
        order: { id: 'ASC' }, take: 2 });
      expect(originales).toHaveLength(2);
      const [ida, idb] = originales.map((cita) => cita.id);
      for (const cita of originales) {
        const condicion = await f.db.manager.save(CondicionConfirmacionCita, { ...base, citaId: cita.id, vencimientoUtc: antes });
        await f.db.manager.update(Cita, cita.id, { estado: cita.id === ida ? 'pendiente' : 'confirmada',
          generacionAutomatizacion: 1, condicionVigenteId: condicion.id });
      }
      f.reloj.fijar(m.plazo);
      expect(await m.cancelar.ejecutarLote(1)).toEqual({ canceladas: 0, seguimiento: 1 });
      expect((await m.condiciones())[0].estadoPolitica).toBe('pendiente');
      expect((await f.db.manager.findOneByOrFail(CondicionConfirmacionCita, { citaId: ida })).estadoPolitica).toBe('seguimiento_manual');
      expect(await m.cancelar.ejecutarLote(1)).toEqual({ canceladas: 0, seguimiento: 1 });
      expect(await m.cancelar.ejecutarLote(1)).toEqual({ canceladas: 0, seguimiento: 0 });
      expect((await f.db.manager.findOneByOrFail(Cita, { id: idb })).estado).toBe('confirmada');
      expect((await f.db.manager.findOneByOrFail(CondicionConfirmacionCita, { id: noVigente.id })).estadoPolitica).toBe('pendiente');
    });
  });

  it('revierte la cancelación y permite reintentar si falla el evento de sistema', async () => {
    await conAgendaHttp(async (f) => {
      const m = await preparar(f);
      f.reloj.fijar(new Date(m.plazo.getTime() - 1)); await m.acuse(); f.reloj.fijar(m.plazo);
      const antes = await m.leer();
      await f.db.query(`CREATE TRIGGER m5_cancelacion_falla BEFORE INSERT ON eventos_cita FOR EACH ROW
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fallo de auditoría de prueba'`);
      await expect(m.cancelar.ejecutarLote()).rejects.toThrow();
      expect(await m.leer()).toEqual(antes);
      expect((await m.condiciones())[0].estadoPolitica).toBe('pendiente');
      expect(await m.eventos()).toHaveLength(0);
      await f.db.query('DROP TRIGGER m5_cancelacion_falla');
      expect(await m.cancelar.ejecutarLote()).toEqual({ canceladas: 1, seguimiento: 0 });
      expect(await m.eventos()).toHaveLength(1);
    });
  });

  it('relee la cita bajo el bloqueo del Profesional si cambia después de seleccionarla', async () => {
    await conAgendaHttp(async (f) => {
      const m = await preparar(f);
      f.reloj.fijar(new Date(m.plazo.getTime() - 1)); await m.acuse(); f.reloj.fijar(m.plazo);
      const runner = f.segunda.createQueryRunner();
      let proceso: ReturnType<typeof m.cancelar.ejecutarLote> | undefined;
      try {
        await runner.connect(); await runner.startTransaction('READ COMMITTED');
        await runner.query('SELECT id FROM personal WHERE id=? FOR UPDATE', [m.cita.personalId]);
        proceso = m.cancelar.ejecutarLote();
        // La búsqueda del proceso está bloqueada en la fila común del Profesional.
        const limite = Date.now() + 5_000;
        let espera = false;
        while (!espera && Date.now() < limite) {
          espera = (await f.db.query(`SELECT ID FROM information_schema.PROCESSLIST
            WHERE DB=DATABASE() AND ID<>CONNECTION_ID() AND INFO LIKE '%FROM \`personal\` \`r\`%FOR UPDATE%'`)).length > 0;
          if (!espera) await new Promise((resolver) => setTimeout(resolver, 20));
        }
        expect(espera).toBe(true);
        await runner.query("UPDATE citas SET estado='confirmada',version=version+1 WHERE id=?", [m.cita.id]);
        await runner.commitTransaction();
        expect(await proceso).toEqual({ canceladas: 0, seguimiento: 0 });
        expect(await m.leer()).toMatchObject({ estado: 'confirmada', causaCancelacion: null });
        expect(await m.eventos()).toHaveLength(0);
      } finally {
        if (runner.isTransactionActive) await runner.rollbackTransaction();
        await runner.release();
        if (proceso) await Promise.allSettled([proceso]);
      }
    });
  });
});

describe('M5-T091–T093 · Nuevas generaciones al gestionar citas', () => {
  it('mueve la Pendiente, conserva snapshots y deja sin efecto su botón anterior y su plazo', async () => {
    await conAgendaHttp(async (f) => {
      const m = await preparar(f);
      function mover() { return f.app.get(CambioHorarioCitaService).cambiar(m.identidad, String(m.cita.id), destino); }
      await f.db.query(`INSERT INTO configuracion_automatizaciones (negocio_id,version,plazo_confirmacion_horas,recordatorio_horas)
        VALUES (?,1,12,12)`, [m.cita.negocioId]);
      const anterior = await m.leer();
      const movida = await mover();
      expect(movida).toMatchObject({ estado: 'confirmada', version: 2, inicioUtc: '2026-11-09T16:20:00.000Z' });
      expect(await m.leer()).toMatchObject({ origen: anterior.origen, costoAceptado: anterior.costoAceptado,
        nombreServicio: anterior.nombreServicio, telefonoContacto: anterior.telefonoContacto, generacionAutomatizacion: 2 });
      expect(await m.condiciones()).toEqual([
        expect.objectContaining({ id: m.condicion.id, vencimientoUtc: m.plazo, estadoPolitica: 'anulada' }),
        expect.objectContaining({ generacion: 2, vencimientoUtc: null, estadoPolitica: 'confirmada', categoria: 'normal',
          origenConfirmacion: 'personal', confirmadoEn: f.reloj.ahora(), versionConfiguracion: 1 }),
      ]);
      expect(await m.envios()).toEqual([
        expect.objectContaining({ id: m.envio.id, estado: 'aceptado', generacion: 1 }),
        expect.objectContaining({ tipo: 'recordatorio', generacion: 2, programadoEn: new Date('2026-11-09T04:20:00Z') }),
      ]);
      await m.recibir({ messages: [{ type: 'button', id: 'wamid.boton-antiguo', from: '526141234567',
        context: { id: mensaje }, button: { payload: m.payload }, timestamp: String(f.reloj.ahora().getTime() / 1000) }] });
      expect((await f.db.manager.findOneByOrFail(AccionConfirmacion, { envioId: m.envio.id })).consumidoEn).toBeNull();
      expect(await m.eventos()).toHaveLength(1);
      f.reloj.fijar(m.plazo);
      expect(await m.cancelar.ejecutarLote()).toEqual({ canceladas: 0, seguimiento: 0 });
    });
  });

  it('reactiva solo si el intervalo está libre, limpia la causa y preserva el evento de cancelación', async () => {
    await conAgendaHttp(async (f) => {
      const m = await preparar(f);
      f.reloj.fijar(new Date(m.plazo.getTime() - 1)); await m.acuse(); f.reloj.fijar(m.plazo);
      await situarSesion(f.db, m.actor, m.plazo);
      await m.cancelar.ejecutarLote();
      const [cancelacion] = await m.eventos();
      const reportes = f.app.get(CortesReporteService);
      const admin = f.actor(Rol.ADMIN_NEGOCIO).id;
      const filtros = { desde: '2026-11-09', hasta: '2026-11-09', agrupacion: 'semana',
        personalId: m.cita.personalId, sucursalId: m.cita.sucursalId };
      const corteCancelada = await reportes.crear(admin, filtros);
      const { id: _id, ...cita } = await m.leer();
      const rival = await f.db.manager.save(Cita, { ...cita,
        sucursalId: f.negocios[0].sucursales[1].id, estado: 'confirmada', causaCancelacion: null,
        generacionAutomatizacion: null, condicionVigenteId: null });
      await expect(m.cambiar('confirmada', 2)).rejects.toMatchObject({ status: 409 });
      expect((await m.leer()).causaCancelacion).toBe('falta_confirmacion_plazo');
      expect(await m.eventos()).toEqual([cancelacion]);
      await f.db.manager.update(Cita, rival.id, { estado: 'cancelada' });
      await f.db.query(`INSERT INTO configuracion_automatizaciones (negocio_id,version,plazo_confirmacion_horas,recordatorio_horas)
        VALUES (?,1,12,12)`, [m.cita.negocioId]);
      await expect(m.cambiar('confirmada', 2)).resolves.toMatchObject({ estado: 'confirmada', version: 3 });
      expect(await m.leer()).toMatchObject({ causaCancelacion: null, generacionAutomatizacion: 2, inicioUtc: inicio, origen: 'portal_publico' });
      // El mismo historial de cancelación existe en ambos momentos, pero solo el primer
      // corte guarda una cancelación automática vigente.
      const corteReactivada = await reportes.crear(admin, filtros);
      await expect(reportes.obtenerResumen(admin, corteCancelada.id)).resolves.toMatchObject({
        totalCitas: 1, estados: { cancelada: 1 }, cancelacionesAutomaticas: 1,
      });
      await expect(reportes.obtenerResumen(admin, corteReactivada.id)).resolves.toMatchObject({
        totalCitas: 1, estados: { confirmada: 1, cancelada: 0 }, cancelacionesAutomaticas: 0,
      });
      expect(await m.eventos()).toEqual([cancelacion, expect.objectContaining({ accion: 'reactivacion',
        valoresAntes: { estado: 'cancelada', version: 2, causaCancelacion: 'falta_confirmacion_plazo' },
        valoresDespues: { estado: 'confirmada', version: 3, causaCancelacion: null } })]);
      expect((await m.condiciones())[0].estadoPolitica).toBe('cancelada');
      expect((await m.envios()).at(-1)).toMatchObject({ tipo: 'recordatorio', generacion: 2,
        programadoEn: new Date(inicio.getTime() - 12 * 3_600_000) });
    });
  });

  it('al volver a Pendiente, descarta el recordatorio y guarda seguimiento sin plazo nuevo', async () => {
    await conAgendaHttp(async (f) => {
      const m = await preparar(f);
      await f.app.get(CambioHorarioCitaService).cambiar(m.identidad, String(m.cita.id), destino);
      const [, recordatorio] = await m.envios();
      expect(recordatorio).toMatchObject({ tipo: 'recordatorio', estado: 'pendiente' });
      await expect(m.cambiar('pendiente', 2)).resolves.toMatchObject({ estado: 'pendiente', version: 3 });
      await expect(m.cambiar('pendiente', 3)).resolves.toMatchObject({ estado: 'pendiente', version: 3 });
      expect(await m.condiciones()).toHaveLength(3);
      expect((await m.condiciones()).at(-1)).toMatchObject({ generacion: 3, vencimientoUtc: null, plazoAplicadoMinutos: null,
        confirmadoEn: null, estadoPolitica: 'seguimiento_manual', motivoSeguimiento: expect.any(String) });
      expect((await m.envios()).at(-1)).toMatchObject({ id: recordatorio.id, estado: 'descartado' });
      f.reloj.fijar(m.plazo);
      expect(await m.cancelar.ejecutarLote()).toEqual({ canceladas: 0, seguimiento: 0 });
      expect(await m.eventos()).toHaveLength(2);
    });
  });
});

describe('M5-T094–T097 · Recordatorio, recuperación y proyección privada', () => {
  it('programa al confirmar manualmente y descarta al mover y al cancelar', async () => {
    await conAgendaHttp(async (f) => {
      const m = await preparar(f);
      await m.cambiar('confirmada', 1);
      const [, recordatorio] = await m.envios();
      expect(recordatorio).toMatchObject({ tipo: 'recordatorio', estado: 'pendiente', generacion: 1,
        programadoEn: new Date(inicio.getTime() - 24 * 3_600_000) });
      await f.app.get(CambioHorarioCitaService).cambiar(m.identidad, String(m.cita.id), { ...destino, version: 2 });
      expect((await m.envios()).find(({ id }) => id === recordatorio.id)).toMatchObject({ estado: 'descartado', intentos: 0 });
      const [, , nuevo] = await m.envios();
      expect(nuevo).toMatchObject({ tipo: 'recordatorio', estado: 'pendiente', generacion: 2 });
      await m.cambiar('cancelada', 3);
      expect((await m.envios()).find(({ id }) => id === nuevo.id)).toMatchObject({ estado: 'descartado', intentos: 0 });
      expect((await m.leer()).estado).toBe('cancelada');
    });
  });

  it('muestra plazo, seguimiento y comunicación solo a personal con alcance', async () => {
    await conAgendaHttp(async (f) => {
      const m = await preparar(f);
      const ruta = `/citas/${m.cita.id}`;
      const leer = () => request(f.http).get(ruta).set('Authorization', m.auth).expect(200);
      await m.acuse();
      const activa = await leer();
      expect(activa.body).toMatchObject({ estado: 'pendiente', seguimiento: { estado: 'plazo_activo',
        vencimientoUtc: m.plazo.toISOString(), envios: [{ tipo: 'inicial_pendiente', estado: 'leido' }] } });
      expect(JSON.stringify(activa.body.seguimiento)).not.toMatch(/wamid|52\d{10}|tokenHash|correlacion|parametros/);
      const calendario = await request(f.http).get('/citas').query({ desde: '2026-11-09', hasta: '2026-11-09' })
        .set('Authorization', m.auth).expect(200);
      expect(calendario.body.citas.find((cita: { id: number }) => cita.id === m.cita.id))
        .toMatchObject({ seguimientoEstado: 'plazo_activo' });
      const ajeno = f.actores.find((actor) => actor.rol === Rol.PROFESIONAL && actor.negocioId === m.cita.negocioId
        && actor.id !== m.cita.personalId)!;
      await request(f.http).get(ruta).set('Authorization', `Bearer ${f.token(ajeno.id)}`).expect(404);
      await f.db.manager.update(CondicionConfirmacionCita, m.condicion.id, { estadoPolitica: 'seguimiento_manual',
        motivoSeguimiento: 'WhatsApp informó un fallo de entrega.' });
      await f.db.manager.update(EnvioWhatsapp, m.envio.id, { estado: 'fallido' });
      expect((await leer()).body).toMatchObject({ estado: 'pendiente', seguimiento: { estado: 'seguimiento_manual',
        motivoSeguimiento: 'WhatsApp informó un fallo de entrega.', envios: [{ tipo: 'inicial_pendiente', estado: 'fallido' }] } });
    });
  });
});
