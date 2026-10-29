import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { createHmac } from 'node:crypto';

export interface ContactoReservaPublica {
  nombre: string;
  telefono: string;
  notas: string | null;
}

const MAX_CUERPO_BYTES = 32 * 1024;

/** Valida los campos que más tarde se copiarán a la cita, sin truncar entradas. */
export function validarContactoReservaPublica(entrada: unknown): ContactoReservaPublica {
  if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada)) {
    throw new BadRequestException('Corrija el formulario de contacto.');
  }
  // Respaldo para llamadas internas; el middleware HTTP limita los bytes
  // originales, que pueden incluir espacios y claves repetidas del JSON.
  if (Buffer.byteLength(JSON.stringify(entrada), 'utf8') > MAX_CUERPO_BYTES) {
    throw new BadRequestException('El formulario excede 32 KiB.');
  }
  const datos = entrada as Record<string, unknown>;
  if (Object.keys(datos).some((campo) => !['nombre', 'telefono', 'notas'].includes(campo))) {
    throw new BadRequestException('Corrija los campos del formulario.');
  }
  const nombre = typeof datos.nombre === 'string' ? datos.nombre.trim() : '';
  if (!nombre || [...nombre].length > 150) {
    throw new BadRequestException('Corrija el nombre: máximo 150 caracteres.');
  }
  if (typeof datos.telefono !== 'string') {
    throw new BadRequestException('Corrija el teléfono: use diez dígitos mexicanos.');
  }
  // Solo se quitan los separadores permitidos. Letras y prefijos distintos de
  // +52 permanecen, por lo que fallan la expresión de diez dígitos.
  const sinSeparadores = datos.telefono.replace(/[\s-]/g, '');
  const telefono = sinSeparadores.startsWith('+52') ? sinSeparadores.slice(3) : sinSeparadores;
  if (!/^\d{10}$/.test(telefono)) {
    throw new BadRequestException('Corrija el teléfono: use diez dígitos mexicanos.');
  }
  if (datos.notas !== undefined && datos.notas !== null && typeof datos.notas !== 'string') {
    throw new BadRequestException('Corrija las notas.');
  }
  const notas = typeof datos.notas === 'string' ? datos.notas.trim() : '';
  if ([...notas].length > 2000) {
    throw new BadRequestException('Corrija las notas: máximo 2000 caracteres.');
  }
  return { nombre, telefono, notas: notas || null };
}

/** La huella solo compara reintentos; el secreto impide enumerar teléfonos. */
export function huellaContactoReservaPublica(contacto: ContactoReservaPublica,
  secreto = process.env.PORTAL_FORMULARIO_HMAC_SECRET): string {
  if (!secreto || secreto.length < 32) {
    throw new ServiceUnavailableException('Portal no configurado.');
  }
  return createHmac('sha256', secreto)
    .update(JSON.stringify([contacto.nombre, contacto.telefono, contacto.notas]))
    .digest('hex');
}
