import { BadRequestException } from '@nestjs/common';
import { normalizarTelefonoMexicano, validarNombreContacto } from '../comun/contacto-persona';

export interface DatosCliente { nombreCompleto: string; telefono: string }
export interface CorreccionCliente { version: number; nombreCompleto?: string; telefono?: string }
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

/** Campos de ficha exclusivamente: no admite negocio, notas, email ni una versión elegida al crear. */
export function validarAltaCliente(entrada: unknown): DatosCliente {
  const datos = objeto(entrada, ['nombreCompleto', 'telefono'], ['nombreCompleto', 'telefono']);
  return { nombreCompleto: validarNombreContacto(datos.nombreCompleto), telefono: normalizarTelefonoMexicano(datos.telefono) };
}

/** La versión es obligatoria y se comprueba incluso cuando la normalización no cambia valores. */
export function validarCorreccionCliente(entrada: unknown): CorreccionCliente {
  const datos = objeto(entrada, ['nombreCompleto', 'telefono', 'version'], ['version']);
  if (typeof datos.version !== 'number' || !Number.isInteger(datos.version) || datos.version < 1 || datos.version > 4294967295 ||
    (!Object.hasOwn(datos, 'nombreCompleto') && !Object.hasOwn(datos, 'telefono'))) throw invalida();
  return { version: datos.version,
    ...(Object.hasOwn(datos, 'nombreCompleto') ? { nombreCompleto: validarNombreContacto(datos.nombreCompleto) } : {}),
    ...(Object.hasOwn(datos, 'telefono') ? { telefono: normalizarTelefonoMexicano(datos.telefono) } : {}) };
}

export function validarIdCliente(id: unknown): number { return enteroQuery(id, 4294967295); }
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
