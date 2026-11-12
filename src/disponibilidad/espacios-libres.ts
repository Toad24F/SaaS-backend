import { restarRestricciones, type Intervalo } from '../bloqueos/calculo-bloqueos';
import type { Ocupacion, TramoEfectivo } from './contratos-internos';

/** Une solo atención continua de la sede elegida; un cierre corta la unión. */
export function construirEspaciosLibres(tramos: readonly TramoEfectivo[],
  sucursalId: number, ocupaciones: readonly Ocupacion[]): Intervalo[] {
  const ordenados = tramos.filter((tramo) => tramo.bloque.sucursalId === sucursalId)
    .map((tramo) => ({ inicio: tramo.inicioUtc, fin: tramo.finUtc }))
    .sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
  const continuos: Intervalo[] = [];
  for (const tramo of ordenados) {
    const ultimo = continuos[continuos.length - 1];
    if (ultimo && tramo.inicio <= ultimo.fin) {
      if (tramo.fin > ultimo.fin) ultimo.fin = tramo.fin;
    } else {
      continuos.push({ ...tramo });
    }
  }
  // Las ocupaciones llegan de todas las sedes del Profesional y usan su fin
  // protegido guardado; el próximo inicio se redondeará por separado.
  return restarRestricciones(continuos, ocupaciones.map((ocupacion) => ({
    inicio: ocupacion.inicioUtc, fin: ocupacion.finOcupacionUtc,
  })));
}

/** Los intervalos semiabiertos admiten contacto exacto con ocupación o cierre. */
export function cabeEnEspacioLibre(espacios: readonly Intervalo[], inicioUtc: Date,
  finUtc: Date): boolean {
  return finUtc > inicioUtc && espacios.some((espacio) =>
    espacio.inicio <= inicioUtc && finUtc <= espacio.fin);
}
