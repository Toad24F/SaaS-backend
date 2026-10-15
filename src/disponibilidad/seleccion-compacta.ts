import type { Ocupacion, TramoEfectivo } from './contratos-internos';
import { ocupacionesQueSeEmpalman } from './ocupaciones.service';

export interface RanuraInterna { inicioUtc: Date; finUtc: Date }

/** Elige vecinos de referencias reales sobre el anclaje original de cada tramo. */
export function seleccionarCompactas(tramos: readonly TramoEfectivo[],
  ocupaciones: readonly Ocupacion[], candidatos: readonly RanuraInterna[],
  intervaloMinutos: number, duracionMinutos: number): RanuraInterna[] {
  const paso = intervaloMinutos * 60000;
  const duracion = duracionMinutos * 60000;
  const validos = new Map(candidatos.map((c) => [c.inicioUtc.getTime(), c]));
  const elegidos = new Map<number, RanuraInterna>();
  for (const tramo of tramos) {
    const bloqueInicio = tramo.bloque.inicioUtc.getTime();
    const comienzo = tramo.inicioUtc.getTime();
    const termino = tramo.finUtc.getTime();
    const primero = Math.max(0, Math.ceil((comienzo - bloqueInicio) / paso));
    const secuencia: number[] = [];
    // El corte limita el tramo, pero no crea otro anclaje de intervalos.
    for (let indice = primero; bloqueInicio + indice * paso < termino; indice += 1) {
      secuencia.push(bloqueInicio + indice * paso);
    }
    const referencias = ocupacionesQueSeEmpalman(ocupaciones, tramo.inicioUtc,
      tramo.finUtc);
    for (const referencia of referencias) {
      // Se prueban únicamente los inicios más próximos de la secuencia a cada lado.
      // Sus extremos son los UTC persistidos, incluso si cruzan otro bloque.
      const antes = [...secuencia].reverse().find((t) =>
        t + duracion <= referencia.inicioUtc.getTime());
      const despues = secuencia.find((t) => t >= referencia.finUtc.getTime());
      for (const inicio of [antes, despues]) {
        if (inicio !== undefined && validos.has(inicio)) {
          elegidos.set(inicio, validos.get(inicio)!);
        }
      }
    }
    // Sin vecino válido, el primer hueco restante abre otro grupo independiente.
    if (!referencias.length || !secuencia.some((t) => elegidos.has(t))) {
      const alternativa = secuencia.find((t) => validos.has(t));
      if (alternativa !== undefined) elegidos.set(alternativa, validos.get(alternativa)!);
    }
  }
  return [...elegidos.values()].sort((a, b) =>
    a.inicioUtc.getTime() - b.inicioUtc.getTime());
}
