import type { EntradaSemana } from './horarios.service';

/** Canoniza la semana antes de persistir: los borradores incompletos nunca se fusionan. */
export function fusionarFranjas<T extends EntradaSemana>(entrada: T[]): EntradaSemana[] {
  const completas = (fila: EntradaSemana) => fila.sucursalId != null &&
    fila.inicioMinutos != null && fila.finMinutos != null;
  const ordenadas = entrada.map((fila) => ({ ...fila })).sort((a, b) =>
    a.diaSemana - b.diaSemana || (a.sucursalId ?? -1) - (b.sucursalId ?? -1) ||
    Number(a.activo) - Number(b.activo) ||
    (a.inicioMinutos ?? -1) - (b.inicioMinutos ?? -1) ||
    (a.finMinutos ?? -1) - (b.finMinutos ?? -1) ||
    a.orden - b.orden || (a.id ?? 0) - (b.id ?? 0));
  const resultado: EntradaSemana[] = [];
  for (const fila of ordenadas) {
    const anterior = resultado.at(-1);
    // La continuidad exacta preserva huecos y evita unir estados diferentes.
    if (anterior && completas(anterior) && completas(fila) &&
      anterior.diaSemana === fila.diaSemana && anterior.sucursalId === fila.sucursalId &&
      anterior.activo === fila.activo && anterior.finMinutos === fila.inicioMinutos) {
      anterior.finMinutos = fila.finMinutos;
      anterior.id = [anterior.id, fila.id].filter((id): id is number => id !== undefined)
        .sort((a, b) => a - b)[0];
    } else resultado.push(fila);
  }
  // El orden técnico no depende del orden en que el navegador envió las filas.
  const indices = new Map<number, number>();
  return resultado.map((fila) => {
    const orden = indices.get(fila.diaSemana) ?? 0;
    indices.set(fila.diaSemana, orden + 1);
    return { ...fila, orden };
  });
}
