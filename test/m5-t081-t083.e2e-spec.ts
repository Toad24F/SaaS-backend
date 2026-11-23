import { createHmac, randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { EnviosWhatsappModule } from '../src/automatizaciones/envios-whatsapp.module';
import { CONFIGURACION_WEBHOOK_WHATSAPP, instalarCuerpoWebhookWhatsapp } from '../src/automatizaciones/webhook-whatsapp.http';
import { EventoWhatsapp } from '../src/automatizaciones/entities/evento-whatsapp.entity';
import { EnvioWhatsapp } from '../src/automatizaciones/entities/envio-whatsapp.entity';
import { Cita } from '../src/disponibilidad/entities/cita.entity';
import { RELOJ } from '../src/comun/reloj';
import { conBaseOperativa, crearEscenarioOperativo } from './support/operacion-fase-5';
import { RelojPrueba } from './support/reloj';

const ahora = new Date('2026-11-23T12:00:00Z');
const secreto = 'secreto-webhook-sintetico';
const token = 'token-verificacion-sintetico';
const ruta = '/webhooks/whatsapp';
const numeroA = '123456';
const numeroB = '654321';
const wamid = 'wamid.acuse';

function notificacion(numero: string, valor: object) {
  return { object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: {
    metadata: { phone_number_id: numero }, ...valor,
  } }] }] };
}

function estado(tipo: string, correlacion?: string, id = wamid) {
  return { id, status: tipo, timestamp: '1795435190', biz_opaque_callback_data: correlacion };
}

async function conWebhook(db: DataSource) {
  const reloj = new RelojPrueba(ahora);
  const { negocios: [a, b] } = await crearEscenarioOperativo(db, reloj);
  for (const [negocio, numero] of [[a.id, numeroA], [b.id, numeroB]]) {
    // El canal deshabilitado sigue recibiendo acuses de trabajos anteriores.
    await db.query('INSERT INTO canales_whatsapp (negocio_id, remitente_externo_id, secreto_ref) VALUES (?,?,?)',
      [negocio, numero, 'secret://whatsapp/test']);
  }
  const citaId = a.ocupaciones[0];
  await db.query(`INSERT INTO condiciones_confirmacion_cita (negocio_id,cita_id,generacion,categoria,instante_base)
    VALUES (?,?,1,'normal',?)`, [a.id, citaId, ahora]);
  const [condicion] = await db.query('SELECT id FROM condiciones_confirmacion_cita WHERE cita_id=? AND generacion=1', [citaId]);
  await db.manager.update(Cita, citaId, { estado: 'pendiente', condicionVigenteId: condicion.id, generacionAutomatizacion: 1 });
  const correlacion = randomUUID();
  await db.query(`INSERT INTO envios_whatsapp
    (negocio_id,cita_id,generacion,tipo,clave_efecto,destino_e164,parametros_plantilla,programado_en,
    util_hasta,proximo_intento_en,estado,intentos,correlacion_proveedor)
    VALUES (?,?,1,'inicial_pendiente','efecto-acuse','+526141234567','{}',?,?,?,'incierto',1,?)`,
  [a.id, citaId, ahora, new Date(ahora.getTime() + 60_000), ahora, correlacion]);
  const modulo = await Test.createTestingModule({ imports: [
    TypeOrmModule.forRoot({ ...db.options, autoLoadEntities: true }), EnviosWhatsappModule,
  ] }).overrideProvider(RELOJ).useValue(reloj)
    .overrideProvider(CONFIGURACION_WEBHOOK_WHATSAPP).useValue({ secretoApp: secreto, tokenVerificacion: token }).compile();
  const app = modulo.createNestApplication({ logger: false });
  instalarCuerpoWebhookWhatsapp(app);
  await app.init();
  const http = request(app.getHttpServer());
  const enviar = (cuerpo: object | string, firmar = true) => {
    const original = typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo);
    const firma = createHmac('sha256', secreto).update(firmar ? original : 'alterado').digest('hex');
    return http.post(ruta).type('application/json').set('X-Hub-Signature-256', `sha256=${firma}`).send(original);
  };
  return { a, b, citaId, correlacion, http, enviar, reloj, cerrar: () => app.close() };
}

describe('M5-T081–T083, webhook y acuses reales en HTTP/MariaDB', () => {
  it('valida reto y firma sobre bytes originales antes del JSON y resuelve el remitente firmado', async () => {
    await conBaseOperativa(async (db) => {
      const f = await conWebhook(db);
      try {
        await f.http.get(ruta).query({ 'hub.mode': 'subscribe', 'hub.verify_token': token, 'hub.challenge': '007' })
          .expect('Content-Type', /text\/plain/).expect(200, '007');
        await f.http.get(ruta).query({ 'hub.mode': 'subscribe', 'hub.verify_token': token, 'hub.challenge': 'Reto-opaque_abc' })
          .expect(200, 'Reto-opaque_abc');
        await f.http.get(ruta).query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'incorrecto', 'hub.challenge': '007' }).expect(403);
        await f.http.get(ruta).query({ 'hub.mode': 'subscribe', 'hub.verify_token': token }).expect(400);
        await f.enviar('{ JSON incompleto', false).expect(403);
        await f.enviar('{ JSON incompleto').expect(400);
        await f.enviar(notificacion(numeroA, { statuses: [estado('sent', f.correlacion)] }), false).expect(403);
        expect(await db.manager.count(EventoWhatsapp)).toBe(0);
        const ajeno = notificacion(numeroB, { negocioId: f.a.id, statuses: [estado('delivered', f.correlacion)] });
        await f.enviar(` \n${JSON.stringify(ajeno, null, 2)}\n`).expect(200);
        expect(await db.manager.findOneByOrFail(EventoWhatsapp, { negocioId: f.b.id })).toMatchObject({ tipo: 'entregado' });
        expect(await db.manager.findOneByOrFail(EnvioWhatsapp, { citaId: f.citaId })).toMatchObject({ estado: 'incierto' });
        await f.enviar(notificacion('111111', { statuses: [estado('sent', f.correlacion)] })).expect(200);
        expect(await db.manager.count(EventoWhatsapp)).toBe(1);
      } finally { await f.cerrar(); }
    });
  });

  it('devuelve 503 ante fallo de inserción o procesamiento y procesa la fila durable al repetir', async () => {
    await conBaseOperativa(async (db) => {
      const f = await conWebhook(db);
      const acuse = notificacion(numeroA, { statuses: [estado('delivered', f.correlacion)] });
      try {
        await db.query(`CREATE TRIGGER m5_no_recibir BEFORE INSERT ON eventos_whatsapp FOR EACH ROW
          SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'detalle interno de prueba'`);
        const caido = await f.enviar(acuse).expect(503);
        expect(caido.text).not.toContain('detalle interno');
        expect(await db.manager.count(EventoWhatsapp)).toBe(0);
        await db.query('DROP TRIGGER m5_no_recibir');
        await db.query(`CREATE TRIGGER m5_no_procesar BEFORE UPDATE ON envios_whatsapp FOR EACH ROW
          SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fallo de procesamiento'`);
        await f.enviar(acuse).expect(503);
        expect(await db.manager.findOneByOrFail(EventoWhatsapp, { negocioId: f.a.id }))
          .toMatchObject({ estadoProcesamiento: 'pendiente', procesadoEn: null });
        await db.query('DROP TRIGGER m5_no_procesar');
        await Promise.all([f.enviar(acuse).expect(200), f.enviar(acuse).expect(200)]);
        expect(await db.manager.count(EventoWhatsapp)).toBe(1);
        expect(await db.manager.findOneByOrFail(EventoWhatsapp, { negocioId: f.a.id })).toMatchObject({ estadoProcesamiento: 'procesado' });
        expect(await db.manager.findOneByOrFail(EnvioWhatsapp, { citaId: f.citaId })).toMatchObject({ estado: 'entregado' });
      } finally { await f.cerrar(); }
    });
  });

  it('concilia un envío incierto y conserva lectura y cita ante acuses atrasados y un botón', async () => {
    await conBaseOperativa(async (db) => {
      const f = await conWebhook(db);
      const antes = await db.manager.findOneByOrFail(Cita, { id: f.citaId });
      try {
        await f.enviar(notificacion(numeroA, { statuses: [estado('read', f.correlacion)] })).expect(200);
        const leer = () => db.manager.findOneByOrFail(EnvioWhatsapp, { citaId: f.citaId });
        expect(await leer()).toMatchObject({ estado: 'leido', leidoEn: ahora, referenciaExterna: wamid, intentos: 1 });
        expect(await db.manager.findOneByOrFail(EventoWhatsapp, { tipo: 'leido' })).toMatchObject({
          proveedorEn: new Date(1_795_435_190_000), recibidoEn: ahora,
        });
        f.reloj.avanzar(5_000);
        await f.enviar(notificacion(numeroA, { statuses: [estado('sent'), estado('delivered'), estado('failed')] })).expect(200);
        expect(await leer()).toMatchObject({ estado: 'leido', leidoEn: ahora, entregadoEn: f.reloj.ahora(), ultimoError: null });
        const payload = 'accion-sintetica-privada';
        await f.enviar(notificacion(numeroA, { messages: [{ id: 'wamid.boton', from: '526141234567',
          timestamp: '1795435190', type: 'button', context: { id: wamid }, button: { payload } }] })).expect(200);
        const recibo = await db.manager.findOneByOrFail(EventoWhatsapp, { tipo: 'respuesta' });
        expect(recibo).toMatchObject({ estadoProcesamiento: 'pendiente', eventoExternoId: 'wamid.boton',
          mensajeExternoId: wamid, accionHash: expect.any(String), remitenteHash: expect.any(String) });
        expect(JSON.stringify(recibo)).not.toMatch(/accion-sintetica-privada|526141234567/);
        expect(await db.manager.findOneByOrFail(Cita, { id: f.citaId })).toEqual(antes);
      } finally { await f.cerrar(); }
    });
  });

  it('el fallo de entrega pone la política vigente en seguimiento y conserva la cita', async () => {
    await conBaseOperativa(async (db) => {
      const f = await conWebhook(db);
      const antes = await db.manager.findOneByOrFail(Cita, { id: f.citaId });
      try {
        // Primero se registra un fallo auténtico. El sent atrasado carece de confirmación de entrega.
        await f.enviar(notificacion(numeroA, { statuses: [estado('failed', f.correlacion)] })).expect(200);
        await f.enviar(notificacion(numeroA, { statuses: [estado('sent')] })).expect(200);
        expect(await db.manager.findOneByOrFail(EnvioWhatsapp, { citaId: f.citaId }))
          .toMatchObject({ estado: 'fallido', referenciaExterna: wamid, ultimoError: 'fallo_reportado_por_proveedor' });
        const politica = () => db.query('SELECT estado_politica FROM condiciones_confirmacion_cita WHERE cita_id=?', [f.citaId]);
        expect(await politica()).toEqual([{ estado_politica: 'seguimiento_manual' }]);
        await f.enviar(notificacion(numeroA, { statuses: [estado('delivered')] })).expect(200);
        expect(await db.manager.findOneByOrFail(EnvioWhatsapp, { citaId: f.citaId })).toMatchObject({ estado: 'entregado' });
        expect(await politica()).toEqual([{ estado_politica: 'seguimiento_manual' }]);
        expect(await db.manager.findOneByOrFail(Cita, { id: f.citaId })).toEqual(antes);
      } finally { await f.cerrar(); }
    });
  });
});
