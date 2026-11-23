import { BadRequestException } from '@nestjs/common';
import { createHash, createHmac } from 'node:crypto';
import type { EventoWhatsapp, TipoEventoWhatsapp } from './entities/evento-whatsapp.entity';

export type ReciboWhatsapp = Pick<EventoWhatsapp, 'huellaEvento' | 'eventoExternoId' | 'mensajeExternoId'
  | 'correlacionProveedor' | 'tipo' | 'proveedorEn' | 'remitenteHash' | 'accionHash'> & { remitenteExternoId: string };

const ESTADOS = new Map<string, TipoEventoWhatsapp>([
  ['sent', 'enviado'], ['delivered', 'entregado'], ['read', 'leido'], ['failed', 'fallo'],
]);

/** Extrae solo los campos de acuse y las huellas necesarias para respuestas rápidas. */
export function extraerRecibosWhatsapp(datos: unknown, secretoApp: string): ReciboWhatsapp[] {
  const raiz = objeto(datos);
  if (raiz.object !== 'whatsapp_business_account') throw contratoInvalido();
  const recibos: ReciboWhatsapp[] = [];
  for (const entrada of lista(raiz.entry)) {
    for (const cambio of lista(objeto(entrada).changes)) {
      const { field, value } = objeto(cambio);
      if (field !== 'messages') continue;
      const valor = objeto(value);
      const numero = objeto(valor.metadata).phone_number_id;
      if (typeof numero !== 'string' || !/^\d{1,100}$/.test(numero)) throw contratoInvalido();
      for (const estado of lista(valor.statuses ?? [])) {
        const { id, status, timestamp, biz_opaque_callback_data: correlacion } = objeto(estado);
        if (typeof status !== 'string') throw contratoInvalido();
        const tipo = ESTADOS.get(status);
        if (!tipo) continue;
        const mensaje = identificador(id);
        const proveedorEn = fechaProveedor(timestamp);
        const uuid = typeof correlacion === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(correlacion)
          ? correlacion : null;
        recibos.push({ remitenteExternoId: numero, tipo, proveedorEn, mensajeExternoId: mensaje,
          eventoExternoId: null, huellaEvento: huella(JSON.stringify([tipo, mensaje, proveedorEn.getTime()])),
          correlacionProveedor: uuid, remitenteHash: null, accionHash: null });
      }
      for (const entrada of lista(valor.messages ?? [])) {
        const mensaje = objeto(entrada);
        if (mensaje.type !== 'button') continue;
        const evento = identificador(mensaje.id);
        const original = identificador(objeto(mensaje.context).id);
        const payload = objeto(mensaje.button).payload;
        if (typeof payload !== 'string' || !payload.length || payload.length > 512
          || typeof mensaje.from !== 'string' || !/^\d{7,15}$/.test(mensaje.from)) throw contratoInvalido();
        recibos.push({ remitenteExternoId: numero, tipo: 'respuesta', eventoExternoId: evento,
          mensajeExternoId: original, proveedorEn: fechaProveedor(mensaje.timestamp), correlacionProveedor: null,
          huellaEvento: huella(JSON.stringify(['respuesta', evento])), accionHash: huella(payload),
          remitenteHash: createHmac('sha256', secretoApp).update(`remitente-whatsapp:${mensaje.from}`).digest('hex') });
      }
    }
  }
  return recibos;
}

function huella(texto: string): string {
  return createHash('sha256').update(texto).digest('hex');
}

function identificador(valor: unknown): string {
  if (typeof valor !== 'string' || !/^[!-~]{1,128}$/.test(valor)) throw contratoInvalido();
  return valor;
}

function fechaProveedor(valor: unknown): Date {
  if (typeof valor !== 'string' || !/^\d{1,12}$/.test(valor) || Number(valor) > 253_402_300_799) throw contratoInvalido();
  return new Date(Number(valor) * 1000);
}

function objeto(valor: unknown): Record<string, unknown> {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) throw contratoInvalido();
  return valor as Record<string, unknown>;
}

function lista(valor: unknown): unknown[] {
  if (!Array.isArray(valor)) throw contratoInvalido();
  return valor;
}

function contratoInvalido(): BadRequestException {
  return new BadRequestException('Notificación de WhatsApp inválida.');
}
