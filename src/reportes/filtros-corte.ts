import { BadRequestException } from '@nestjs/common';
import { validarFechaLocal } from '../horarios/calendario';

export interface FiltrosCorte {
  desde: string;
  hasta: string;
  agrupacion: 'semana' | 'mes';
  sucursalId: number | null;
  personalId: number | null;
  servicioId: number | null;
}

const CAMPOS = new Set(['desde', 'hasta', 'agrupacion', 'sucursalId', 'personalId', 'servicioId']);

function idOpcional(valor: unknown): number | null {
  if (valor === null || valor === undefined) return null;
  if (typeof valor !== 'number' || !Number.isInteger(valor) || valor < 1 || valor > 0xffffffff) {
    throw new BadRequestException('Los filtros deben contener identificadores enteros positivos.');
  }
  return valor;
}

/** Normaliza filtros opcionales y excluye identidad y estado del cuerpo de la solicitud. */
export function validarFiltrosCorte(entrada: unknown): FiltrosCorte {
  if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada) ||
      Object.keys(entrada).some((campo) => !CAMPOS.has(campo))) {
    throw new BadRequestException('Filtros de reporte inválidos.');
  }
  const { desde, hasta, agrupacion, sucursalId, personalId, servicioId } = entrada as Record<string, unknown>;
  if (typeof desde !== 'string' || typeof hasta !== 'string' ||
      (agrupacion !== 'semana' && agrupacion !== 'mes')) {
    throw new BadRequestException('Indica el periodo y una agrupación por semana o mes.');
  }
  validarFechaLocal(desde);
  validarFechaLocal(hasta);
  if (desde > hasta) throw new BadRequestException('La fecha inicial debe ser anterior o igual a la final.');
  return {
    desde, hasta, agrupacion, sucursalId: idOpcional(sucursalId),
    personalId: idOpcional(personalId), servicioId: idOpcional(servicioId),
  };
}
