import { HttpException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { CupoTelefonicoExcedidoException, MENSAJE_CUPO_TELEFONICO } from '../reservas-publicas/cupo-telefonico.service';
import { CODIGO_AGENDA_AMPLIA, ConsultaAgendaDemasiadoAmpliaException, MENSAJE_AGENDA_AMPLIA } from './limites-agenda';

const MENSAJES: Readonly<Record<number, string>> = {
  400: 'Entrada operativa inválida.',
  401: 'Sesión no válida o acceso actual no disponible.',
  403: 'No tiene permiso para realizar esta operación.',
  404: 'Recurso no disponible.',
  409: 'La operación entra en conflicto con los datos vigentes.',
  500: 'No se pudo completar la operación. Reintente.',
  503: 'No se pudo comprobar la operación. Reintente.',
};
const TEMPORALES = new Set(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'PROTOCOL_CONNECTION_LOST',
  'ER_LOCK_WAIT_TIMEOUT', 'ER_LOCK_DEADLOCK', 'ER_CON_COUNT_ERROR']);

/** Marca interna: una segunda frontera conserva solo errores ya construidos con texto seguro. */
class ErrorOperativoSeguro extends HttpException {
  constructor(estado: number, mensaje: string, codigo?: string) {
    super({ statusCode: estado, message: mensaje, ...(codigo ? { codigo } : {}) }, estado);
  }
}

/** No reenvía mensajes, causas, SQL, cuerpos ni trazas aportados por otro error. */
export function normalizarErrorOperativo(error: unknown): HttpException {
  if (error instanceof ErrorOperativoSeguro) return error;
  if (error instanceof ConsultaAgendaDemasiadoAmpliaException) {
    return new ErrorOperativoSeguro(400, MENSAJE_AGENDA_AMPLIA, CODIGO_AGENDA_AMPLIA);
  }
  if (error instanceof CupoTelefonicoExcedidoException) {
    return new ErrorOperativoSeguro(409, MENSAJE_CUPO_TELEFONICO);
  }
  if (error instanceof HttpException) {
    const recibido = error.getStatus();
    // La frontera valida el valor real: una excepción externa puede incumplir el tipo estático.
    const estado = typeof recibido === 'number' && Number.isInteger(recibido) && Object.hasOwn(MENSAJES, recibido)
      ? recibido : 500;
    return new ErrorOperativoSeguro(estado, MENSAJES[estado]);
  }
  const datos = error as { code?: unknown; driverError?: { code?: unknown } } | null;
  const codigo = error instanceof QueryFailedError ? datos?.driverError?.code : datos?.code;
  const estado = typeof codigo === 'string' && TEMPORALES.has(codigo) ? 503 : 500;
  return new ErrorOperativoSeguro(estado, MENSAJES[estado]);
}
