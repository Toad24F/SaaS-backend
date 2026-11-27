/** Entrada de selección: negocio y titular se resuelven en el servidor. */
export interface SeleccionPublica {
  personalId: number;
  sucursalId: number;
  servicioId: number;
  fechaLocal: string;
  horaInicio: string;
}

/** Resumen de una reserva propia. La identidad de la cita se conserva en el intento.
 * El costo fijado se proyecta según la visibilidad pública vigente. */
export interface ResultadoReservaPublica {
  estado: 'pendiente';
  inicioUtc: string;
  finUtc: string;
  zonaHoraria: string;
  costoAceptado: string;
  nombreNegocio: string;
  nombreServicio: string;
  nombreSucursal: string;
  nombreProfesional: string;
  /** Hora exacta de la política de esta cita; null siempre exige seguimiento humano. */
  vencimientoConfirmacionUtc: string | null;
  seguimientoManual: boolean;
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
