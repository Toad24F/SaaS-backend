/** Entrada de selección: negocio y titular se resuelven en el servidor. */
export interface SeleccionPublica {
  personalId: number;
  sucursalId: number;
  servicioId: number;
  fechaLocal: string;
  horaInicio: string;
}

/** Datos mínimos de salida que puede presentar el portal sin datos administrativos. */
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

/** Contexto interno autorizado: estos IDs nunca provienen del cuerpo público. */
export interface ContextoReservaPublica {
  negocioId: number;
  sesionId: number;
  ahora: Date;
}
