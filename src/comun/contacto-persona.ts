import { BadRequestException } from '@nestjs/common';

/** Regla compartida por portal y fichas: caracteres Unicode, sin truncar ni interpretar HTML. */
export function validarNombreContacto(valor: unknown): string {
  const nombre = typeof valor === 'string' ? valor.trim() : '';
  if (!nombre || [...nombre].length > 150) throw new BadRequestException('Corrija el nombre: máximo 150 caracteres.');
  return nombre;
}

/** Solo elimina separadores permitidos y el prefijo +52; el teléfono no identifica personas. */
export function normalizarTelefonoMexicano(valor: unknown): string {
  if (typeof valor !== 'string') throw new BadRequestException('Corrija el teléfono: use diez dígitos mexicanos.');
  const sinSeparadores = valor.replace(/[\s-]/g, '');
  const telefono = sinSeparadores.startsWith('+52') ? sinSeparadores.slice(3) : sinSeparadores;
  if (!/^\d{10}$/.test(telefono)) throw new BadRequestException('Corrija el teléfono: use diez dígitos mexicanos.');
  return telefono;
}
