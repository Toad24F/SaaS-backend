import { HttpException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';

const CODIGOS_TEMPORALES = new Set(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT',
  'PROTOCOL_CONNECTION_LOST', 'ER_CON_COUNT_ERROR', 'ER_LOCK_WAIT_TIMEOUT',
  'ER_LOCK_DEADLOCK']);

const RESPUESTAS: Record<number, { mensaje: string; accion: string }> = {
  400: { mensaje: 'Revise los datos de la consulta.', accion: 'corregir' },
  401: { mensaje: 'La sesión ya no es válida. Inicie de nuevo.', accion: 'reiniciar' },
  403: { mensaje: 'La solicitud no está permitida.', accion: 'corregir' },
  404: { mensaje: 'El portal o la selección no está disponible.', accion: 'volver' },
  409: { mensaje: 'La selección cambió. Elija un horario vigente.', accion: 'volver' },
  500: { mensaje: 'No se pudo completar la solicitud.', accion: 'reintentar' },
  503: { mensaje: 'Portal temporalmente no disponible.', accion: 'reintentar' },
};

/** Reduce una causa interna a estado, mensaje y acción públicos; nunca copia SQL,
 * trazas, secretos ni el mensaje original de una excepción no controlada. */
export function normalizarErrorPublico(error: unknown): HttpException {
  let estado = 500;
  if (error instanceof HttpException) {
    estado = error.getStatus();
  } else {
    const datos = error as { code?: unknown; driverError?: { code?: unknown } } | null;
    const codigo = error instanceof QueryFailedError ? datos?.driverError?.code :
      datos?.code ?? datos?.driverError?.code;
    if (typeof codigo === 'string' && CODIGOS_TEMPORALES.has(codigo)) estado = 503;
  }
  if (!Object.hasOwn(RESPUESTAS, estado)) estado = 500;
  return new HttpException({ codigo: `portal_${estado}`,
    ...RESPUESTAS[estado] }, estado);
}
