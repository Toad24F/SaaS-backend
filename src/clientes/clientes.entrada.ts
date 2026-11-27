import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { normalizarTelefonoMexicano, validarNombreContacto } from '../comun/contacto-persona';

export interface DatosCliente { nombreCompleto: string; telefono: string }
export interface CorreccionCliente { version: number; nombreCompleto?: string; telefono?: string }
export const MAX_ENTERO_CLIENTE = 4294967295;
const invalida = () => new BadRequestException('Entrada operativa inválida.');
function objeto(entrada: unknown, permitidos: string[], obligatorios: string[] = []): Record<string, unknown> {
  if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada)) throw invalida();
  if (Object.keys(entrada).some((k) => !permitidos.includes(k)) || obligatorios.some((k) => !Object.hasOwn(entrada, k))) throw invalida();
  return entrada as Record<string, unknown>;
}
function enteroQuery(valor: unknown, maximo: number): number {
  if (typeof valor !== 'string' || !/^[1-9]\d*$/.test(valor)) throw invalida();
  const numero = Number(valor);
  if (!Number.isSafeInteger(numero) || numero > maximo) throw invalida();
  return numero;
}

function enteroCliente(valor: unknown): number {
  if (typeof valor !== 'number' || !Number.isInteger(valor) || valor < 1 || valor > MAX_ENTERO_CLIENTE) throw invalida();
  return valor;
}

function cambiosDeContacto(datos: Record<string, unknown>): Partial<DatosCliente> {
  if (!Object.hasOwn(datos, 'nombreCompleto') && !Object.hasOwn(datos, 'telefono')) throw invalida();
  return {
    ...(Object.hasOwn(datos, 'nombreCompleto') ? { nombreCompleto: validarNombreContacto(datos.nombreCompleto) } : {}),
    ...(Object.hasOwn(datos, 'telefono') ? { telefono: normalizarTelefonoMexicano(datos.telefono) } : {}),
  };
}

/** Campos de ficha exclusivamente: no admite negocio, notas, email ni una versión elegida al crear. */
export function validarAltaCliente(entrada: unknown): DatosCliente {
  const datos = objeto(entrada, ['nombreCompleto', 'telefono'], ['nombreCompleto', 'telefono']);
  return { nombreCompleto: validarNombreContacto(datos.nombreCompleto), telefono: normalizarTelefonoMexicano(datos.telefono) };
}

/** La versión es obligatoria y se comprueba incluso cuando la normalización no cambia valores. */
export function validarCorreccionCliente(entrada: unknown): CorreccionCliente {
  const datos = objeto(entrada, ['nombreCompleto', 'telefono', 'version'], ['version']);
  return { version: enteroCliente(datos.version), ...cambiosDeContacto(datos) };
}

/** Sin propuesta, la coincidencia debe existir entre los datos actuales de las fichas elegidas. */
export function validarUnionCliente(entrada: unknown, origenId: number) {
  const requeridos = ['destinoId', 'versionOrigen', 'versionDestino', 'clave'];
  const datos = objeto(entrada, [...requeridos, 'datosPropuestos'], requeridos);
  const destinoId = enteroCliente(datos.destinoId);
  if (destinoId === origenId || typeof datos.clave !== 'string' || !/^[A-Za-z0-9_-]{16,64}$/.test(datos.clave)) {
    throw invalida();
  }
  return { destinoId, versionOrigen: enteroCliente(datos.versionOrigen), versionDestino: enteroCliente(datos.versionDestino),
    clave: datos.clave, datosPropuestos: Object.hasOwn(datos, 'datosPropuestos')
      ? cambiosDeContacto(objeto(datos.datosPropuestos, ['nombreCompleto', 'telefono'])) : null };
}

/** El mismo secreto operativo se usa con un dominio distinto al de las citas manuales. */
export function huellaUnionCliente(origenId: number, union: ReturnType<typeof validarUnionCliente>,
  secreto = process.env.CITAS_MANUALES_HMAC_SECRET): string {
  if (!secreto || secreto.length < 32) throw new ServiceUnavailableException('No se pudo comprobar la operación. Reintente.');
  return createHmac('sha256', secreto).update('union-cliente:v1\0').update(JSON.stringify([
    origenId, union.destinoId, union.versionOrigen, union.versionDestino,
    union.datosPropuestos?.nombreCompleto ?? null, union.datosPropuestos?.telefono ?? null,
  ])).digest('hex');
}

export function validarIdCliente(id: unknown): number { return enteroQuery(id, MAX_ENTERO_CLIENTE); }
export function validarPaginacionClientes(entrada: unknown) {
  const datos = objeto(entrada, ['pagina', 'limite']);
  return { pagina: datos.pagina === undefined ? 1 : enteroQuery(datos.pagina, 1_000_000),
    limite: datos.limite === undefined ? 50 : enteroQuery(datos.limite, 100) };
}
export function validarConsultaFicha(entrada: unknown): void { objeto(entrada, []); }
export function validarBusquedaClientes(entrada: unknown) {
  const datos = objeto(entrada, ['pagina', 'limite', 'busqueda']);
  if (datos.busqueda !== undefined && (typeof datos.busqueda !== 'string' || [...datos.busqueda].length > 150 ||
    [...datos.busqueda].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127))) throw invalida();
  return { ...validarPaginacionClientes({
    ...(datos.pagina === undefined ? {} : { pagina: datos.pagina }), ...(datos.limite === undefined ? {} : { limite: datos.limite }) }),
    ...(datos.busqueda === undefined ? {} : { busqueda: (datos.busqueda as string).trim() }) };
}
