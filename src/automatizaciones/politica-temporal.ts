/** Política pura en UTC: compara instantes, sin depender de zona local ni de la base de datos. */
const HORA = 3_600_000;
const MINUTO = 60_000;

export interface VencimientoConfirmacion {
  categoria: 'normal' | 'proxima';
  plazoAplicadoMinutos: number | null;
  vencimientoUtc: Date | null;
  motivoSeguimiento: string | null;
}

export function calcularVencimientoConfirmacion(ahora: Date, inicioUtc: Date,
  plazoHoras: number): VencimientoConfirmacion {
  const distancia = inicioUtc.getTime() - ahora.getTime();
  if (distancia <= 6 * HORA) {
    const vencimiento = ahora.getTime() + 15 * MINUTO;
    // El límite cercano que coincide con el comienzo no permite cancelación automática.
    return vencimiento < inicioUtc.getTime()
      ? { categoria: 'proxima', plazoAplicadoMinutos: 15, vencimientoUtc: new Date(vencimiento), motivoSeguimiento: null }
      : { categoria: 'proxima', plazoAplicadoMinutos: null, vencimientoUtc: null,
        motivoSeguimiento: 'El plazo de 15 minutos alcanza o rebasa el inicio.' };
  }
  const vencimiento = Math.min(ahora.getTime() + plazoHoras * HORA, inicioUtc.getTime() - HORA);
  return { categoria: 'normal', plazoAplicadoMinutos: Math.round((vencimiento - ahora.getTime()) / MINUTO),
    vencimientoUtc: new Date(vencimiento), motivoSeguimiento: null };
}

export function calcularRecordatorio(ahora: Date, inicioUtc: Date,
  anticipacionHoras: number, proxima: boolean): Date | null {
  // Solo se agenda una vez por generación si todavía queda tiempo para ejecutarlo.
  const programado = inicioUtc.getTime() - anticipacionHoras * HORA;
  return proxima || programado <= ahora.getTime() ? null : new Date(programado);
}
