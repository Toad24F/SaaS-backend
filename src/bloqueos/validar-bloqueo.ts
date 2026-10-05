import { BadRequestException } from '@nestjs/common';
import { validarFechaLocal } from '../horarios/calendario';

export const TIPOS_BLOQUEO = ['vacaciones', 'dia_festivo', 'emergencia'] as const;
export type TipoBloqueo = typeof TIPOS_BLOQUEO[number];

export interface DatosBloqueo {
  personalId: number | null;
  sucursalId: number | null;
  tipo: TipoBloqueo;
  motivo: string;
  fechaInicio: string;
  fechaFin: string;
  inicioMinutos: number | null;
  finMinutos: number | null;
}

/** Conserva fechas civiles hasta interpretarlas en la zona de cada sede afectada. */
export function validarBloqueo(datos: DatosBloqueo): DatosBloqueo {
  if ((datos.personalId !== null && (!Number.isInteger(datos.personalId) || datos.personalId <= 0)) ||
    (datos.sucursalId !== null && (!Number.isInteger(datos.sucursalId) || datos.sucursalId <= 0))) {
    throw new BadRequestException('personalId y sucursalId deben ser identificadores positivos o null.');
  }
  if (!TIPOS_BLOQUEO.includes(datos.tipo) || typeof datos.motivo !== 'string' ||
    !datos.motivo.trim() || datos.motivo.trim().length > 500) {
    throw new BadRequestException('Tipo y motivo de bloqueo obligatorios.');
  }
  validarFechaLocal(datos.fechaInicio);
  validarFechaLocal(datos.fechaFin);
  if (datos.fechaInicio > datos.fechaFin) {
    throw new BadRequestException('El intervalo del bloqueo está invertido.');
  }
  const tieneInicio = datos.inicioMinutos !== null;
  const tieneFin = datos.finMinutos !== null;
  if (tieneInicio !== tieneFin || (tieneInicio &&
    (!Number.isInteger(datos.inicioMinutos) || datos.inicioMinutos! < 0 ||
      datos.inicioMinutos! > 1439 || !Number.isInteger(datos.finMinutos) ||
      datos.finMinutos! < 1 || datos.finMinutos! > 1440 ||
      (datos.fechaInicio === datos.fechaFin && datos.inicioMinutos! >= datos.finMinutos!)))) {
    throw new BadRequestException('Horas incompletas o intervalo de bloqueo vacío o invertido.');
  }
  // Sin horas se bloquean todos los días inclusivos; con horas hay un solo intervalo continuo.
  return { ...datos, motivo: datos.motivo.trim() };
}
