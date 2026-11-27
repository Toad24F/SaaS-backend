import { BadRequestException } from '@nestjs/common';
import { normalizarTelefonoContacto, validarNombreContacto } from '../comun/contacto-persona';

/** Identidad exacta del nombre. La ficha conserva su ortografía original para presentación. */
export function normalizarNombreCliente(nombre: string): string {
  return nombre.normalize('NFC').toLowerCase().normalize('NFC')
    .replace(/[\p{White_Space}\uFEFF]+/gu, ' ').trim();
}

export function normalizarIdentidadCliente(nombre: unknown, telefono: unknown) {
  const nombreNormalizado = normalizarNombreCliente(validarNombreContacto(nombre));
  // La clave debe contener texto y poder guardarse en UTF-8 sin reemplazar caracteres.
  if (!nombreNormalizado || /\p{Surrogate}/u.test(nombreNormalizado)) {
    throw new BadRequestException('Corrija el nombre: use caracteres Unicode válidos.');
  }
  return { nombreNormalizado, telefono: normalizarTelefonoContacto(telefono) };
}
