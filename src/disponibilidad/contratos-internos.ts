/** Franja de origen: conserva el anclaje aunque se resten descansos o bloqueos. */
export interface BloqueOriginal {
  id: number;
  origen: 'semanal' | 'excepcion';
  fechaLocal: string;
  sucursalId: number;
  zonaHoraria: string;
  inicioUtc: Date;
  finUtc: Date;
}

/** Parte atendible de un bloque; la continuidad se comprueba sin perder su origen. */
export interface TramoEfectivo {
  bloque: BloqueOriginal;
  inicioUtc: Date;
  finUtc: Date;
}

/** Intervalo que ocupa al Profesional, incluso si procede de otra sucursal. */
export interface Ocupacion {
  tipo: 'cita' | 'apartado';
  id: number;
  negocioId: number;
  personalId: number;
  sucursalId: number;
  servicioId: number;
  inicioUtc: Date;
  finUtc: Date;
  estado?: string;
  expiraEn?: Date;
  liberadoEn?: Date | null;
}

/** Resultado interno; la capa HTTP filtrará causas y datos según el actor. */
export interface ResultadoDisponibilidad {
  negocioId: number;
  personalId: number;
  sucursalId: number;
  servicioId: number;
  desde: string;
  hasta: string;
  zonaHoraria: string;
  calculadoEn: Date;
  modalidad: 'publica' | 'manual';
  ranuras: Array<{ inicioUtc: Date; finUtc: Date }>;
  omisiones: Array<{ fechaLocal: string; motivo: string }>;
}
