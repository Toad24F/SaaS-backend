import { createHash, createHmac } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { Sesion } from '../src/auth/entities/sesion.entity';
import { SesionesService } from '../src/auth/services/sesiones.service';
import { CLAVE_ACCIONES_WHATSAPP } from '../src/automatizaciones/acciones-whatsapp.service';
import { EfectoInicialService } from '../src/automatizaciones/efecto-inicial.service';
import { AccionConfirmacion } from '../src/automatizaciones/entities/accion-confirmacion.entity';
import { CondicionConfirmacionCita } from '../src/automatizaciones/entities/condicion-confirmacion-cita.entity';
import { ConfiguracionAutomatizaciones } from '../src/automatizaciones/entities/configuracion-automatizaciones.entity';
import { EnvioWhatsapp } from '../src/automatizaciones/entities/envio-whatsapp.entity';
import { EventoWhatsapp } from '../src/automatizaciones/entities/evento-whatsapp.entity';
import { EnviosWhatsappModule } from '../src/automatizaciones/envios-whatsapp.module';
import { ProcesadorWhatsappService } from '../src/automatizaciones/procesador-whatsapp.service';
import { RecepcionWhatsappService } from '../src/automatizaciones/recepcion-whatsapp.service';
import { TRANSPORTE_WHATSAPP, TransporteWhatsappControlado } from '../src/automatizaciones/transporte-whatsapp';
import { CONFIGURACION_WEBHOOK_WHATSAPP, instalarCuerpoWebhookWhatsapp } from '../src/automatizaciones/webhook-whatsapp.http';
import { EventoCita } from '../src/citas/entities/evento-cita.entity';
import { CitasModule } from '../src/citas/citas.module';
import { ConsultaAgendaService } from '../src/citas/consulta-agenda.service';
import { RELOJ } from '../src/comun/reloj';
import { Cita } from '../src/disponibilidad/entities/cita.entity';
import { conBaseOperativa, crearEscenarioOperativo } from './support/operacion-fase-5';
import { RelojPrueba } from './support/reloj';

const ahora = new Date('2026-11-23T12:00:00Z');
const clave = 'clave-sintetica-de-confirmacion-whatsapp-084';
const secretoApp = 'secreto-sintetico-del-webhook';
const canal = '123456';
const otroCanal = '654321';
const telefono = '526141234567';
const mensaje = 'wamid.inicial';

function boton(payload: string, id = 'wamid.boton', from = telefono, contexto = mensaje) {
  return { type: 'button', id, from, context: { id: contexto }, button: { payload },
    timestamp: String(ahora.getTime() / 1000) };
}

async function escenario(db: DataSource, opciones: { sinPlazo?: boolean; reintento?: boolean } = {}) {
  const reloj = new RelojPrueba(ahora);
  const { negocios: [negocio, otro] } = await crearEscenarioOperativo(db, reloj);
  for (const [id, remitente] of [[negocio.id, canal], [otro.id, otroCanal]]) {
    await db.query(`INSERT INTO canales_whatsapp (negocio_id,remitente_externo_id,secreto_ref,habilitado)
      VALUES (?,?,'secret://whatsapp/test',1)`, [id, remitente]);
  }
  const citas = db.getRepository(Cita);
  const cita = await citas.findOneByOrFail({ id: negocio.ocupaciones[0] });
  cita.estado = 'pendiente';
  cita.origen = 'portal_publico';
  cita.inicioUtc = new Date(ahora.getTime() + (opciones.sinPlazo ? 10 * 60_000 : 48 * 3_600_000));
  cita.finUtc = new Date(cita.inicioUtc.getTime() + 30 * 60_000);
  cita.finOcupacionUtc = new Date(cita.finUtc.getTime() + cita.separacionMinutos * 60_000);
  cita.telefonoContacto = telefono.slice(2);
  await citas.save(cita);
  await db.transaction((manager) => new EfectoInicialService().preparar(manager, cita, ahora, true));
  const condicion = await db.manager.findOneByOrFail(CondicionConfirmacionCita, { citaId: cita.id });
  const aceptado = { estado: 'aceptado', referencia: mensaje } as const;
  const transporte = opciones.reintento
    ? new TransporteWhatsappControlado({ estado: 'rechazado', transitorio: true }, aceptado)
    : new TransporteWhatsappControlado(aceptado, { estado: 'aceptado', referencia: 'wamid.recordatorio' });
  const modulo = await Test.createTestingModule({ imports: [
    TypeOrmModule.forRoot({ ...db.options, autoLoadEntities: true }), EnviosWhatsappModule, CitasModule,
  ] }).overrideProvider(RELOJ).useValue(reloj).overrideProvider(TRANSPORTE_WHATSAPP).useValue(transporte)
    .overrideProvider(CLAVE_ACCIONES_WHATSAPP).useValue(clave)
    .overrideProvider(CONFIGURACION_WEBHOOK_WHATSAPP).useValue({ secretoApp }).compile();
  const app = modulo.createNestApplication({ logger: false });
  instalarCuerpoWebhookWhatsapp(app);
  try {
    await app.init();
    const proceso = modulo.get(ProcesadorWhatsappService);
    expect(await proceso.ejecutarUna()).toBe(true);
    if (opciones.reintento) {
      reloj.avanzar(60_000);
      expect(await proceso.ejecutarUna()).toBe(true);
    }
    const payload = transporte.solicitudes.at(-1)?.plantilla.respuestaRapida;
    if (!payload) throw new Error('La plantilla de prueba debe incluir su botón.');
    const http = request(app.getHttpServer());
    const enviar = (valor: object, remitente = canal, firmado = true) => {
      const cuerpo = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ changes: [
        { field: 'messages', value: { metadata: { phone_number_id: remitente }, ...valor } },
      ] }] });
      const firma = createHmac('sha256', secretoApp).update(firmado ? cuerpo : 'otro cuerpo').digest('hex');
      return http.post('/webhooks/whatsapp').type('application/json').set('X-Hub-Signature-256', `sha256=${firma}`).send(cuerpo);
    };
    return { cita, reloj, condicion, enviar, transporte, proceso, recepcion: modulo.get(RecepcionWhatsappService), cerrar: () => app.close(),
      leerCita: () => citas.findOneByOrFail({ id: cita.id }),
      leerCondicion: () => db.manager.findOneByOrFail(CondicionConfirmacionCita, { id: condicion.id }),
      acciones: () => db.manager.findBy(AccionConfirmacion, { citaId: cita.id }),
      eventos: () => db.manager.findBy(EventoCita, { citaId: cita.id }), payload,
      historial: async () => {
        const [actor] = await db.query("SELECT id FROM usuarios WHERE negocio_id=? AND rol='admin_negocio'", [cita.negocioId]);
        const sesion = await new SesionesService(db.getRepository(Sesion)).crear(actor.id, reloj.ahora());
        return modulo.get(ConsultaAgendaService).historial({ sub: Number(actor.id), sesionId: sesion.id }, String(cita.id), {});
      } };
  } catch (error) {
    await app.close();
    throw error;
  }
}

describe('M5-T084–T087 · Acción de confirmación desde el webhook', () => {
  it('reproduce el botón al reintentar y persiste solo la huella; rechaza payload, remitente, canal y contexto ajenos', async () => {
    await conBaseOperativa(async (db) => {
      const f = await escenario(db, { reintento: true });
      try {
        expect(f.payload).toMatch(/^wa1\.[A-Za-z0-9_-]{43}$/);
        expect(f.transporte.solicitudes[0].plantilla.respuestaRapida).toBe(f.payload);
        const acciones = await f.acciones();
        expect(acciones).toHaveLength(1);
        expect(acciones[0]).toMatchObject({ tokenHash: createHash('sha256').update(f.payload).digest('hex'), consumidoEn: null });
        expect(JSON.stringify(acciones)).not.toContain(f.payload);
        await f.enviar({ messages: [boton(f.payload, 'wamid.sin-firma')] }, canal, false).expect(403);
        const alterado = `${f.payload.slice(0, 5)}${f.payload[5] === 'A' ? 'B' : 'A'}${f.payload.slice(6)}`;
        await f.enviar({ messages: [boton(alterado, 'wamid.alterado'), boton(f.payload, 'wamid.otra-persona', '526141234568'),
          boton(f.payload, 'wamid.otro-mensaje', telefono, 'wamid.ajeno')] }).expect(200);
        await f.enviar({ messages: [boton(f.payload, 'wamid.otro-canal')] }, otroCanal).expect(200);
        // Un cambio de remitente en el mismo negocio tampoco traslada el botón anterior.
        await db.query('UPDATE canales_whatsapp SET remitente_externo_id=? WHERE negocio_id=?', ['222222', f.cita.negocioId]);
        await f.enviar({ messages: [boton(f.payload, 'wamid.canal-nuevo')] }, '222222').expect(200);
        expect(await f.leerCita()).toMatchObject({ estado: 'pendiente', version: f.cita.version });
        expect(await f.eventos()).toHaveLength(0);
        expect((await f.acciones())[0].consumidoEn).toBeNull();
      } finally { await f.cerrar(); }
    });
  });

  it('texto y acuses dejan la cita intacta; botones concurrentes confirman una vez con actor WhatsApp', async () => {
    await conBaseOperativa(async (db) => {
      const f = await escenario(db);
      try {
        await f.enviar({ messages: [{ type: 'text', id: 'wamid.texto', text: { body: 'Confirmo' } }],
          statuses: [{ id: mensaje, status: 'read', timestamp: '1795435190' }] }).expect(200);
        expect(await f.leerCita()).toMatchObject({ estado: 'pendiente', version: f.cita.version });
        // Una licencia bloqueada o el canal deshabilitado impiden nuevos envíos, no invalidan esta acción.
        await db.query('UPDATE canales_whatsapp SET habilitado=0 WHERE negocio_id=?', [f.cita.negocioId]);
        f.reloj.avanzar(1_000);
        await db.query('UPDATE licencias SET vence_en=? WHERE negocio_id=?', [f.reloj.ahora(), f.cita.negocioId]);
        f.reloj.fijar(new Date(f.condicion.vencimientoUtc!.getTime() - 1));
        await Promise.all(['wamid.boton-a', 'wamid.boton-b', 'wamid.boton-a'].map((id) =>
          f.enviar({ messages: [boton(f.payload, id)] }).expect(200)));
        expect(await f.leerCita()).toMatchObject({ estado: 'confirmada', version: f.cita.version + 1 });
        expect(await f.leerCondicion()).toMatchObject({ estadoPolitica: 'confirmada', confirmadoEn: f.reloj.ahora(),
          origenConfirmacion: 'whatsapp', vencimientoUtc: f.condicion.vencimientoUtc });
        expect((await f.acciones())[0].consumidoEn).toEqual(f.reloj.ahora());
        const eventos = await f.eventos();
        expect(eventos).toHaveLength(1);
        expect(eventos[0]).toMatchObject({ accion: 'cambio_estado', actorTipo: 'cliente_whatsapp',
          referenciaWhatsapp: expect.stringMatching(/^wamid\.boton-[ab]$/), actorUsuarioId: null, sesionPublicaId: null,
          ocurridoEn: f.reloj.ahora(), versionResultante: f.cita.version + 1 });
        expect(await db.manager.countBy(EventoWhatsapp, { tipo: 'respuesta' })).toBe(2);
      } finally { await f.cerrar(); }
    });
  });

  it.each(['vencida', 'otra generación', 'cancelada', 'otra versión'] as const)(
    'la acción %s no consume el botón ni modifica la cita', async (caso) => {
      await conBaseOperativa(async (db) => {
        const f = await escenario(db);
        try {
          if (caso === 'vencida') f.reloj.fijar(f.condicion.vencimientoUtc!);
          if (caso === 'cancelada') await db.manager.update(Cita, f.cita.id, { estado: 'cancelada' });
          if (caso === 'otra versión') await db.manager.update(Cita, f.cita.id, { version: f.cita.version + 1 });
          if (caso === 'otra generación') {
            const { id: _id, ...anterior } = f.condicion;
            const siguiente = await db.manager.save(CondicionConfirmacionCita, { ...anterior, generacion: 2 });
            await db.manager.update(Cita, f.cita.id, { condicionVigenteId: siguiente.id, generacionAutomatizacion: 2 });
          }
          const antes = await f.leerCita();
          await f.enviar({ messages: [boton(f.payload)] }).expect(200);
          expect(await f.leerCita()).toEqual(antes);
          expect(await f.eventos()).toHaveLength(0);
          expect((await f.acciones())[0].consumidoEn).toBeNull();
        } finally { await f.cerrar(); }
      });
    });

  it.each([-1, 0])('sin plazo automático, inicio más %s ms', async (desfase) => {
    await conBaseOperativa(async (db) => {
      const f = await escenario(db, { sinPlazo: true });
      try {
        expect(f.condicion).toMatchObject({ vencimientoUtc: null, estadoPolitica: 'seguimiento_manual' });
        expect((await f.acciones())[0].expiraEn).toEqual(f.cita.inicioUtc);
        f.reloj.fijar(new Date(f.cita.inicioUtc.getTime() + desfase));
        await f.enviar({ messages: [boton(f.payload)] }).expect(200);
        expect((await f.leerCita()).estado).toBe(desfase < 0 ? 'confirmada' : 'pendiente');
        expect(await f.eventos()).toHaveLength(desfase < 0 ? 1 : 0);
      } finally { await f.cerrar(); }
    });
  });

  it('revierte consumo, política y cita al fallar el historial y recupera el mismo recibo', async () => {
    await conBaseOperativa(async (db) => {
      const f = await escenario(db);
      try {
        await db.query(`CREATE TRIGGER m5_confirmar_falla BEFORE INSERT ON eventos_cita FOR EACH ROW
          SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'detalle privado de prueba'`);
        const respuesta = { messages: [boton(f.payload)] };
        expect((await f.enviar(respuesta).expect(503)).text).not.toContain('detalle privado');
        expect(await f.leerCita()).toMatchObject({ estado: 'pendiente', version: f.cita.version });
        expect(await f.leerCondicion()).toMatchObject({ estadoPolitica: 'pendiente', confirmadoEn: null });
        expect((await f.acciones())[0].consumidoEn).toBeNull();
        expect(await db.manager.findOneByOrFail(EventoWhatsapp, { tipo: 'respuesta' })).toMatchObject({ estadoProcesamiento: 'pendiente' });
        await db.query('DROP TRIGGER m5_confirmar_falla');
        await f.enviar(respuesta).expect(200);
        expect(await f.eventos()).toHaveLength(1);
        expect(await db.manager.countBy(EventoWhatsapp, { tipo: 'respuesta' })).toBe(1);
        const historial = await f.historial();
        expect(historial.eventos).toEqual([expect.objectContaining({ origenActor: 'cliente_whatsapp', actorUsuarioId: null })]);
        expect(JSON.stringify(historial)).not.toContain('wamid.boton');
      } finally { await f.cerrar(); }
    });
  });

  it('procesa un acuse del mismo lote antes de reintentar el botón pendiente de correlación', async () => {
    await conBaseOperativa(async (db) => {
      const f = await escenario(db);
      try {
        await db.manager.update(EnvioWhatsapp, { citaId: f.cita.id }, { estado: 'incierto', aceptadoEn: null, referenciaExterna: null });
        const respuesta = { messages: [boton(f.payload)] };
        await f.enviar(respuesta).expect(503);
        expect(await f.eventos()).toHaveLength(0);
        const correlacion = f.transporte.solicitudes[0].correlacion;
        await f.enviar({ ...respuesta, statuses: [{ id: mensaje, status: 'delivered', timestamp: '1795435190',
          biz_opaque_callback_data: correlacion }] }).expect(200);
        expect(await f.leerCita()).toMatchObject({ estado: 'confirmada' });
        expect(await f.eventos()).toHaveLength(1);
      } finally { await f.cerrar(); }
    });
  });

  it('relee el reloj después de esperar la barrera del Profesional aunque el botón llegara a tiempo', async () => {
    await conBaseOperativa(async (a, b) => {
      const f = await escenario(a);
      const runner = b.createQueryRunner();
      let clic: Promise<{ status: number }> | undefined;
      try {
        await runner.connect();
        await runner.startTransaction('READ COMMITTED');
        await runner.query("UPDATE personal SET especialidad='Barrera de prueba' WHERE id=?", [f.cita.personalId]);
        f.reloj.fijar(new Date(f.condicion.vencimientoUtc!.getTime() - 1));
        clic = f.enviar({ messages: [boton(f.payload)] }).then((respuesta) => respuesta);
        // La segunda conexión demuestra que el webhook ya está esperando, antes de mover el reloj.
        const hasta = Date.now() + 4_000;
        let espera = false;
        while (!espera && Date.now() < hasta) {
          // La consulta bloqueante permanece visible hasta soltar la fila en esta base desechable.
          const filas = await a.query(`SELECT 1 FROM information_schema.PROCESSLIST
            WHERE DB=DATABASE() AND ID<>CONNECTION_ID() AND INFO LIKE '%FROM \`personal\` \`r\`%FOR UPDATE%'`);
          espera = filas.length > 0;
          if (!espera) await new Promise((resolver) => setTimeout(resolver, 20));
        }
        expect(espera).toBe(true);
        f.reloj.fijar(f.condicion.vencimientoUtc!);
        await runner.rollbackTransaction();
        expect((await clic).status).toBe(200);
        expect(await f.leerCita()).toMatchObject({ estado: 'pendiente', version: f.cita.version });
        expect((await f.acciones())[0].consumidoEn).toBeNull();
        expect(await f.eventos()).toHaveLength(0);
      } finally {
        if (runner.isTransactionActive) await runner.rollbackTransaction();
        await runner.release();
        if (clic) await Promise.allSettled([clic]);
        await f.cerrar();
      }
    });
  });
});

describe('M5-T094–T095 · Recordatorio al confirmar', () => {
  it.each([300_000, 300_001, 'inicio alcanzado'] as const)('al confirmar programa una vez y revalida %s', async (retraso) => {
    await conBaseOperativa(async (db) => {
      const f = await escenario(db);
      try {
        await db.manager.save(ConfiguracionAutomatizaciones, { negocioId: f.cita.negocioId,
          version: 1, plazoConfirmacionHoras: 12, recordatorioHoras: 12 });
        await f.enviar({ messages: [boton(f.payload)] }).expect(200);
        await f.enviar({ messages: [boton(f.payload, 'wamid.repetido')] }).expect(200);
        const programadoEn = new Date(f.cita.inicioUtc.getTime() - 12 * 3_600_000);
        const lector = () => db.manager.findBy(EnvioWhatsapp, { citaId: f.cita.id, tipo: 'recordatorio' });
        expect(await lector()).toEqual([expect.objectContaining({ generacion: 1, programadoEn, estado: 'pendiente' })]);
        await db.manager.update(ConfiguracionAutomatizaciones, f.cita.negocioId, { recordatorioHoras: 48, version: 2 });
        expect((await lector())[0].programadoEn).toEqual(programadoEn);
        f.reloj.fijar(typeof retraso === 'number' ? new Date(programadoEn.getTime() + retraso) : f.cita.inicioUtc);
        await f.proceso.ejecutarUna();
        expect((await lector())[0].estado).toBe(retraso === 300_000 ? 'aceptado' : 'descartado');
        f.reloj.fijar(f.cita.inicioUtc);
        expect(await f.proceso.ejecutarUna()).toBe(false);
        expect(await f.leerCita()).toMatchObject({ estado: 'confirmada', version: 2 });
      } finally { await f.cerrar(); }
    });
  });

  it('omite recordatorio próximo sin plazo automático y cuando la hora programable ya llegó', async () => {
    for (const sinPlazo of [true, false]) {
      await conBaseOperativa(async (db) => {
        const f = await escenario(db, { sinPlazo });
        try {
          await db.manager.save(ConfiguracionAutomatizaciones, { negocioId: f.cita.negocioId,
            version: 1, plazoConfirmacionHoras: 12, recordatorioHoras: 48 });
          await f.enviar({ messages: [boton(f.payload)] }).expect(200);
          expect(await db.manager.countBy(EnvioWhatsapp, { citaId: f.cita.id, tipo: 'recordatorio' })).toBe(0);
        } finally { await f.cerrar(); }
      });
    }
  });
});

it('M5-T096 retoma el botón durable tras llegar el acuse por separado', async () => {
  await conBaseOperativa(async (db) => {
    const f = await escenario(db);
    try {
      await db.manager.update(EnvioWhatsapp, { citaId: f.cita.id }, { estado: 'incierto', aceptadoEn: null, referenciaExterna: null });
      await f.enviar({ messages: [boton(f.payload)] }).expect(503);
      await f.recepcion.procesarLote(secretoApp, 50);
      expect(await f.leerCita()).toMatchObject({ estado: 'pendiente' });
      await f.enviar({ statuses: [{ id: mensaje, status: 'delivered', timestamp: '1795435190',
        biz_opaque_callback_data: f.transporte.solicitudes[0].correlacion }] }).expect(200);
      await Promise.all([f.recepcion.procesarLote(secretoApp, 50), f.recepcion.procesarLote(secretoApp, 50)]);
      expect(await f.leerCita()).toMatchObject({ estado: 'confirmada', version: 2 });
      expect(await f.eventos()).toHaveLength(1);
    } finally { await f.cerrar(); }
  });
});
