/** Entrada de selección: negocio y titular se resuelven en el servidor. */
export interface SeleccionPublica {
  personalId: number;
  sucursalId: number;
  servicioId: number;
  fechaLocal: string;
  horaInicio: string;
}

/** Resumen histórico interno: el costo fijado se conserva aunque la respuesta
 * pública actual lo omita o lo presente con el nombre neutral `costo`. */
export interface ResultadoReservaPublica {
  folio: string;
  estado: 'pendiente';
  inicioUtc: string;
  finUtc: string;
  zonaHoraria: string;
  costoAceptado: string;
  nombreNegocio: string;
  nombreServicio: string;
  nombreSucursal: string;
  nombreProfesional: string;
}

/** El importe HTTP es opcional y nunca afirma aceptación de un precio oculto. */
export type ResultadoReservaPublicaHttp =
  Omit<ResultadoReservaPublica, 'costoAceptado'> & { costo?: string };

/** Contexto interno autorizado: estos IDs nunca provienen del cuerpo público. */
export interface ContextoReservaPublica {
  negocioId: number;
  sesionId: number;
  ahora: Date;
}
