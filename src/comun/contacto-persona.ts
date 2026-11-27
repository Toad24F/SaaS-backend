import { BadRequestException } from '@nestjs/common';
import { parsePhoneNumberFromString } from 'libphonenumber-js/max';
import { PAISES_TELEFONO } from './paises-telefono';

/** Regla compartida por portal y fichas: caracteres Unicode, sin truncar ni interpretar HTML. */
export function validarNombreContacto(valor: unknown): string {
  const nombre = typeof valor === 'string' ? valor.trim() : '';
  if (!nombre || [...nombre].length > 150) throw new BadRequestException('Corrija el nombre: máximo 150 caracteres.');
  return nombre;
}

/** Conserva los diez dígitos mexicanos históricos; los demás destinos se guardan en E.164. */
export function normalizarTelefonoContacto(valor: unknown): string {
  const error = () => new BadRequestException('Corrija el teléfono: elija un país admitido y escriba un número válido.');
  if (typeof valor !== 'string' || valor.length > 40 || !/^\+?[\d\s().-]+$/.test(valor)) throw error();
  const entrada = valor.trim();
  const numero = parsePhoneNumberFromString(entrada, { defaultCountry: 'MX', extract: false });
  if (!numero?.country || !PAISES_TELEFONO.has(numero.country) || !numero.isValid()) throw error();
  // Evita que un prefijo de marcación nacional se interprete como otro destino.
  if (!entrada.startsWith('+') && numero.country !== 'MX') throw error();
  return numero.country === 'MX' ? numero.nationalNumber : numero.number;
}
