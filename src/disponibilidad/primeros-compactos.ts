import type { CandidatoLibre } from './candidatos-libres';

/** Compacta compara instantes UTC, pero agrupa por la fecha civil de la sede. */
export function seleccionarPrimerosCompactos(candidatos: readonly CandidatoLibre[],
  zonaHoraria: string): CandidatoLibre[] {
  const formato = new Intl.DateTimeFormat('en-US', { timeZone: zonaHoraria,
    year: 'numeric', month: '2-digit', day: '2-digit' });
  const primeros = new Map<string, CandidatoLibre>();
  for (const candidato of candidatos) {
    const partes = formato.formatToParts(candidato.inicioUtc);
    const valor = (tipo: string) => partes.find((parte) => parte.type === tipo)!.value;
    const fecha = `${valor('year')}-${valor('month')}-${valor('day')}`;
    const anterior = primeros.get(fecha);
    if (!anterior || candidato.inicioUtc < anterior.inicioUtc) {
      primeros.set(fecha, candidato);
    }
  }
  // La consulta de varias fechas conserva un único primer inicio por cada una.
  return [...primeros.values()].sort((a, b) =>
    a.inicioUtc.getTime() - b.inicioUtc.getTime());
}
