import { BadRequestException } from '@nestjs/common';
import { normalizarAcentoPortal } from './colores-portal';

export const MAX_VERSION_PORTAL = 0xffffffff;

function datosExactos(entrada: unknown, campos: readonly string[]): Record<string, unknown> {
  if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada) ||
    Object.keys(entrada).length !== campos.length || campos.some((campo) => !Object.hasOwn(entrada, campo))) {
    throw new BadRequestException('Los datos de personalización no tienen los campos esperados.');
  }
  return entrada as Record<string, unknown>;
}

export function validarVersionPortal(version: unknown): number {
  if (typeof version !== 'number' || !Number.isSafeInteger(version) || version < 0 || version > MAX_VERSION_PORTAL) {
    throw new BadRequestException('La versión de personalización no es válida.');
  }
  return version;
}

export function normalizarIdLogo(id: unknown): string | null {
  return typeof id === 'string' && id.length === 36 &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) ? id.toLowerCase() : null;
}

export function validarPublicacionPortal(entrada: unknown) {
  const datos = datosExactos(entrada, ['version', 'acento', 'logoId']);
  const version = validarVersionPortal(datos.version);
  const acento = normalizarAcentoPortal(datos.acento);
  const logoId = normalizarIdLogo(datos.logoId);
  if (datos.logoId !== null && logoId === null) throw new BadRequestException('El identificador del logo no es válido.');
  return { version, acento, logoId };
}

/** Los campos de formulario llegan como texto y el JSON exige un número real. */
export function leerVersionPortal(entrada: unknown, multipart = false): number {
  const { version } = datosExactos(entrada, ['version']);
  if (!multipart) return validarVersionPortal(version);
  if (typeof version !== 'string' || !/^(0|[1-9][0-9]{0,9})$/.test(version) || version.trim() !== version) {
    throw new BadRequestException('La versión de personalización no es válida.');
  }
  return validarVersionPortal(Number(version));
}
