import { BadRequestException } from '@nestjs/common';

function enteroPositivo(valor: unknown, maximo: number): number {
  if (typeof valor !== 'string' || !/^[1-9]\d*$/.test(valor)) {
    throw new BadRequestException('La paginación requiere enteros positivos.');
  }
  const numero = Number(valor);
  if (!Number.isSafeInteger(numero) || numero > maximo) {
    throw new BadRequestException('La paginación está fuera de rango.');
  }
  return numero;
}

/** Acepta solo parámetros de página. Los filtros pertenecen a la cabecera del corte. */
export function validarPaginacionCorte(query: unknown) {
  if (!query || typeof query !== 'object' || Array.isArray(query) ||
      Object.keys(query).some((campo) => campo !== 'pagina' && campo !== 'limite')) {
    throw new BadRequestException('Parámetros de paginación inválidos.');
  }
  const { pagina, limite } = query as Record<string, unknown>;
  // El ID entero sin signo de la cita acota la cantidad máxima de páginas de una fila.
  return { pagina: pagina === undefined ? 1 : enteroPositivo(pagina, 0xffffffff),
    limite: limite === undefined ? 100 : enteroPositivo(limite, 500) };
}
