import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { validarFechaLocal } from '../horarios/calendario';
import { validarAltaCliente, type DatosCliente } from '../clientes/clientes.entrada';

export type SeleccionManual = {
  sucursalId: number; personalId: number; servicioId: number;
  fechaLocal: string; horaInicio: string; notas: string | null;
} & ({ clienteId: number; clienteNuevo?: never } | { clienteId?: never; clienteNuevo: DatosCliente });

const invalida = () => new BadRequestException('Entrada operativa inválida.');
function id(valor: unknown): number {
  if (typeof valor !== 'number' || !Number.isSafeInteger(valor) || valor < 1 || valor > 4294967295) throw invalida();
  return valor;
}

/** Una única elección de persona; no acepta precio, zona, fines ni exclusiones del navegador. */
export function validarSeleccionManual(entrada: unknown): SeleccionManual {
  if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada)) throw invalida();
  const datos = entrada as Record<string, unknown>;
  const campos = ['clienteId', 'clienteNuevo', 'sucursalId', 'personalId', 'servicioId', 'fechaLocal', 'horaInicio', 'notas'];
  if (Object.keys(datos).some((k) => !campos.includes(k)) ||
    Object.hasOwn(datos, 'clienteId') === Object.hasOwn(datos, 'clienteNuevo')) throw invalida();
  if (typeof datos.fechaLocal !== 'string' || typeof datos.horaInicio !== 'string' ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(datos.horaInicio)) throw invalida();
  validarFechaLocal(datos.fechaLocal);
  if (datos.notas !== undefined && datos.notas !== null && typeof datos.notas !== 'string') throw invalida();
  const notas = typeof datos.notas === 'string' ? datos.notas.trim() : '';
  if ([...notas].length > 2000) throw invalida();
  const cliente = Object.hasOwn(datos, 'clienteId') ? { clienteId: id(datos.clienteId) }
    : { clienteNuevo: validarAltaCliente(datos.clienteNuevo) };
  return { ...cliente, sucursalId: id(datos.sucursalId), personalId: id(datos.personalId),
    servicioId: id(datos.servicioId), fechaLocal: datos.fechaLocal, horaInicio: datos.horaInicio, notas: notas || null };
}

/** La clave estable pertenece al actor y negocio; su comparación binaria conserva mayúsculas. */
export function validarClaveManual(entrada: unknown): string {
  if (typeof entrada !== 'string' || !/^[A-Za-z0-9_-]{16,64}$/.test(entrada)) throw invalida();
  return entrada;
}

/** HMAC con separación de dominio: compara contenido canónico sin persistir contacto ni notas.
 * Su clave estable e independiente de JWT permite renovar sesiones sin invalidar los reintentos.
 */
export function huellaSeleccionManual(entrada: SeleccionManual, secreto = process.env.CITAS_MANUALES_HMAC_SECRET): string {
  if (!secreto || secreto.length < 32) throw new ServiceUnavailableException('No se pudo comprobar la operación. Reintente.');
  return createHmac('sha256', secreto).update('cita-manual:v1\0').update(JSON.stringify([
    entrada.sucursalId, entrada.personalId, entrada.servicioId, entrada.fechaLocal, entrada.horaInicio,
    entrada.clienteId !== undefined ? ['existente', entrada.clienteId]
      : ['nuevo', entrada.clienteNuevo.nombreCompleto, entrada.clienteNuevo.telefono], entrada.notas,
  ])).digest('hex');
}
