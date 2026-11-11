import { BadRequestException } from '@nestjs/common';
import { validarFechaLocal } from '../horarios/calendario';

export interface CambioHorarioEntrada { fechaLocal: string; horaInicio: string; version: number }

/** Solo admite la pared local propuesta y la versión observada; los snapshots se leen del servidor. */
export function validarCambioHorario(entrada: unknown): CambioHorarioEntrada {
  const invalida = () => new BadRequestException('Entrada operativa inválida.');
  if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada)) throw invalida();
  const datos = entrada as Record<string, unknown>;
  if (Object.keys(datos).some(k => !['fechaLocal', 'horaInicio', 'version'].includes(k)) ||
    typeof datos.fechaLocal !== 'string' || typeof datos.horaInicio !== 'string' ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(datos.horaInicio) ||
    typeof datos.version !== 'number' || !Number.isInteger(datos.version) || datos.version < 1 || datos.version > 4294967295) throw invalida();
  validarFechaLocal(datos.fechaLocal);
  return { fechaLocal: datos.fechaLocal, horaInicio: datos.horaInicio, version: datos.version };
}
