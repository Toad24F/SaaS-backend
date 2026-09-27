import { BadRequestException } from '@nestjs/common';

/** Aplica el dominio confirmado: cupo entero desde uno y valor inicial uno. */
export function validarLimiteSucursales(valor: unknown): number {
  if (valor === undefined) return 1;
  if (typeof valor !== 'number' || !Number.isSafeInteger(valor) || valor < 1) {
    throw new BadRequestException('El límite de sucursales debe ser un entero desde uno.');
  }
  return valor;
}
