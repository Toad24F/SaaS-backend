import { BadRequestException } from '@nestjs/common';

// Límites técnicos del lector de calendario: no limitan reservas ni el horizonte de disponibilidad.
export const MAX_FECHAS_AGENDA = 42;
export const MAX_CITAS_AGENDA = 1000;
export const CODIGO_AGENDA_AMPLIA = 'agenda_demasiado_amplia';
export const MENSAJE_AGENDA_AMPLIA = 'Hay demasiadas citas para mostrar el periodo completo. Reduce el rango o filtra por sucursal o Profesional.';

/** Solo esta excepción de dominio habilita el mensaje seguro para acotar una lectura. */
export class ConsultaAgendaDemasiadoAmpliaException extends BadRequestException {
  constructor() { super(MENSAJE_AGENDA_AMPLIA); }
}
