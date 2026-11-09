import { BadRequestException } from '@nestjs/common';

const invalida = () => new BadRequestException('Entrada operativa inválida.');
function entero(valor: unknown, maximo: number): number {
  if (typeof valor !== 'string' || !/^[1-9]\d*$/.test(valor)) throw invalida();
  const numero = Number(valor);
  if (!Number.isSafeInteger(numero) || numero > maximo) throw invalida();
  return numero;
}
function campos(entrada: unknown, permitidos: string[]): Record<string, unknown> {
  if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada) ||
    Object.keys(entrada).some((k) => !permitidos.includes(k))) throw invalida();
  return entrada as Record<string, unknown>;
}
/** Los identificadores y queries se validan antes de abrir la lectura autorizada. */
export function validarIdCita(id: unknown): number { return entero(id, 4294967295); }
export function validarDetalleCita(query: unknown): void { campos(query, []); }
export function validarPaginacionHistorial(query: unknown) {
  const datos = campos(query, ['pagina', 'limite']);
  return { pagina: datos.pagina === undefined ? 1 : entero(datos.pagina, 1_000_000),
    limite: datos.limite === undefined ? 50 : entero(datos.limite, 100) };
}
