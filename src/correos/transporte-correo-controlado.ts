import type { MensajeCorreo, ResultadoEntregaCorreo, TransporteCorreo } from './transporte-correo';

export type ResultadoControlado = 'aceptar' | 'rechazar' | 'timeout';

/** Simula cada resultado sin abrir sockets ni escribir mensajes en disco. */
export class TransporteCorreoControlado implements TransporteCorreo {
  readonly intentos: MensajeCorreo[] = [];
  private readonly resultados: ResultadoControlado[];

  constructor(resultados: ResultadoControlado[] = []) {
    this.resultados = [...resultados];
  }

  async enviar(mensaje: MensajeCorreo): Promise<ResultadoEntregaCorreo> {
    // Copiamos el mensaje: cambios posteriores del llamador no alteran la evidencia de prueba.
    this.intentos.push({ ...mensaje });
    const resultado = this.resultados.shift() ?? 'aceptar';
    if (resultado === 'rechazar') {
      throw new Error('Entrega rechazada por transporte controlado.');
    }
    if (resultado === 'timeout') {
      const error = new Error('Tiempo de espera agotado en transporte controlado.');
      error.name = 'TimeoutError';
      throw error;
    }
    return { idExterno: `controlado-${this.intentos.length}` };
  }
}
