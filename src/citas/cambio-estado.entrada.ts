import { BadRequestException } from '@nestjs/common';
import type { EstadoCita } from '../disponibilidad/entities/cita.entity';

export interface CambioEstadoEntrada { estado: EstadoCita; version: number; motivo: string | null }
const ESTADOS: readonly string[] = ['pendiente', 'confirmada', 'completada', 'cancelada', 'no_asistio'];

/** Contrato cerrado: solo estado, versión observada y motivo; no acepta identidad ni snapshots. */
export function validarCambioEstado(entrada: unknown): CambioEstadoEntrada {
  const invalida = () => new BadRequestException('Entrada operativa inválida.');
  if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada)) throw invalida();
  const datos = entrada as Record<string, unknown>;
  if (Object.keys(datos).some((k) => !['estado', 'version', 'motivo'].includes(k)) ||
    typeof datos.estado !== 'string' || !ESTADOS.includes(datos.estado) ||
    typeof datos.version !== 'number' || !Number.isInteger(datos.version) || datos.version < 1 || datos.version > 4294967295 ||
    (datos.motivo !== undefined && datos.motivo !== null && typeof datos.motivo !== 'string')) throw invalida();
  const motivo = typeof datos.motivo === 'string' ? datos.motivo.trim() : '';
  if ([...motivo].length > 2000) throw invalida();
  return { estado: datos.estado as EstadoCita, version: datos.version, motivo: motivo || null };
}
