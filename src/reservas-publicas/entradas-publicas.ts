import { BadRequestException } from '@nestjs/common';
import { validarConsultaDisponibilidad } from '../disponibilidad/disponibilidad-entradas';

export interface FiltrosCatalogoPublico { servicioId?: number; sucursalId?: number }
export interface ConsultaDisponibilidadPublica {
  personalId: number; sucursalId: number; servicioId: number;
  desde: string; hasta: string;
}

function objeto(entrada: unknown, campos: readonly string[]): Record<string, unknown> {
  if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada) ||
    Object.keys(entrada).some((campo) => !campos.includes(campo))) {
    throw new BadRequestException('Campos públicos inválidos.');
  }
  return entrada as Record<string, unknown>;
}

function id(valor: unknown): number {
  if (typeof valor !== 'string' || !/^[1-9]\d*$/.test(valor) ||
    !Number.isSafeInteger(Number(valor))) {
    throw new BadRequestException('ID público inválido.');
  }
  return Number(valor);
}

/** La sucursal solo puede elegirse después del servicio; el negocio proviene del slug. */
export function validarCatalogoPublico(entrada: unknown): FiltrosCatalogoPublico {
  const datos = objeto(entrada, ['servicioId', 'sucursalId']);
  if (datos.sucursalId !== undefined && datos.servicioId === undefined) {
    throw new BadRequestException('Seleccione primero un servicio.');
  }
  return { ...(datos.servicioId === undefined ? {} : { servicioId: id(datos.servicioId) }),
    ...(datos.sucursalId === undefined ? {} : { sucursalId: id(datos.sucursalId) }) };
}

/** El GET no admite modalidad manual, horas puntuales ni identidades de apartados. */
export function validarDisponibilidadPublica(entrada: unknown): ConsultaDisponibilidadPublica {
  const datos = objeto(entrada, ['personalId', 'sucursalId', 'servicioId', 'desde', 'hasta']);
  const validada = validarConsultaDisponibilidad(datos);
  return { personalId: validada.personalId, sucursalId: validada.sucursalId,
    servicioId: validada.servicioId, desde: validada.desde, hasta: validada.hasta };
}
