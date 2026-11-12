/** El cuerpo existe solo durante la entrega; la bandeja almacena referencias. */
export interface MensajeCorreo {
  destinatario: string;
  asunto: string;
  texto: string;
  /** ID de la fila durable; se conserva entre intentos del mismo envío. */
  identidadLogica?: string;
}

export interface ResultadoEntregaCorreo {
  idExterno: string;
}

/** Puerto del transporte para sustituir la simulación por un proveedor real. */
export interface TransporteCorreo {
  enviar(mensaje: MensajeCorreo): Promise<ResultadoEntregaCorreo>;
}
