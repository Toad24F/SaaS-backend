import { BadRequestException } from '@nestjs/common';

// Fondo y texto solo completan las columnas históricas al insertar una fila.
export const COLORES_PREDETERMINADOS_PORTAL = Object.freeze({
  fondo: '#ffffff',
  texto: '#171717',
  acento: '#2164d8',
});

export function normalizarAcentoPortal(valor: unknown): string {
  if (typeof valor !== 'string' || valor.length !== 7 || !/^#[0-9a-f]{6}$/i.test(valor)) {
    throw new BadRequestException('El color de acento debe ser hexadecimal opaco (#RRGGBB).');
  }
  return valor.toLowerCase();
}
