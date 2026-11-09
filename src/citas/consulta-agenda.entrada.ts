import { BadRequestException } from '@nestjs/common';
import { validarFechaLocal } from '../horarios/calendario';
import type { EstadoCita } from '../disponibilidad/entities/cita.entity';
import { MAX_FECHAS_AGENDA } from './limites-agenda';

export interface ConsultaAgendaEntrada {
  desde: string;
  hasta: string;
  sucursalId?: number;
  personalId?: number;
  estado?: EstadoCita;
  busqueda?: string;
}
const CAMPOS = ['desde', 'hasta', 'sucursalId', 'personalId', 'estado', 'busqueda'];
const ESTADOS = ['pendiente', 'confirmada', 'completada', 'cancelada', 'no_asistio'];
const invalida = () => new BadRequestException('Entrada operativa inválida.');

function entero(valor: unknown, maximo: number): number {
  if (typeof valor !== 'string' || !/^[1-9]\d*$/.test(valor)) throw invalida();
  const numero = Number(valor);
  if (!Number.isSafeInteger(numero) || numero > maximo) throw invalida();
  return numero;
}

/** Contrato de query cerrado: valida todo antes de autorizar o consultar persistencia. */
export function validarConsultaAgenda(entrada: unknown): ConsultaAgendaEntrada {
  if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada)) throw invalida();
  const d = entrada as Record<string, unknown>;
  if (Object.keys(d).some((k) => !CAMPOS.includes(k)) || !Object.hasOwn(d, 'desde') || !Object.hasOwn(d, 'hasta')) throw invalida();
  if (typeof d.desde !== 'string' || typeof d.hasta !== 'string') throw invalida();
  try { validarFechaLocal(d.desde); validarFechaLocal(d.hasta); } catch { throw invalida(); }
  const inicio = Date.parse(`${d.desde}T00:00:00Z`);
  const fin = Date.parse(`${d.hasta}T00:00:00Z`);
  // Las fechas civiles cuentan inclusive, independientemente de la duración UTC de sus días.
  if (Number(d.desde.slice(0, 4)) < 1000 || Number(d.hasta.slice(0, 4)) < 1000 || fin < inicio || fin - inicio >= MAX_FECHAS_AGENDA * 86400000) throw invalida();
  if (d.estado !== undefined && (typeof d.estado !== 'string' || !ESTADOS.includes(d.estado))) throw invalida();
  if (d.busqueda !== undefined && (typeof d.busqueda !== 'string' || d.busqueda.length > 150 ||
    [...d.busqueda].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127))) throw invalida();
  return { desde: d.desde, hasta: d.hasta,
    ...(d.sucursalId === undefined ? {} : { sucursalId: entero(d.sucursalId, 4294967295) }),
    ...(d.personalId === undefined ? {} : { personalId: entero(d.personalId, 4294967295) }),
    ...(d.estado === undefined ? {} : { estado: d.estado as EstadoCita }),
    ...(d.busqueda === undefined ? {} : { busqueda: (d.busqueda as string).trim() }) };
}
