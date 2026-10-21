import { ServiceUnavailableException } from '@nestjs/common';

/** Interruptor operativo: producción exige habilitación expresa; cerrar gana
 * inmediatamente para solicitudes nuevas sin tocar citas ni intentos. */
export function exigirEscriturasPublicas(): void {
  const estado = process.env.PORTAL_PUBLICO_ESCRITURAS;
  if (estado === 'cerradas' || (process.env.NODE_ENV === 'production' &&
    estado !== 'habilitadas')) {
    throw new ServiceUnavailableException('Nuevas reservas suspendidas.');
  }
}
