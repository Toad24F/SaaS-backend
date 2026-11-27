import { intervaloBloqueo } from './calculo-bloqueos';
import { resolverInstanteLocal } from '../horarios/calendario';
import type { DatosBloqueo } from './validar-bloqueo';

type FechasBloqueo = Pick<DatosBloqueo, 'fechaInicio' | 'fechaFin' | 'inicioMinutos' | 'finMinutos'>;
export type VigenciaBloqueo = 'vigente' | 'proximo' | 'anterior';

/** Un colectivo ocupa una sola fila: basta una sede vigente; después prima la próxima. */
export function clasificarBloqueo(datos: FechasBloqueo, zonas: string[], ahora: Date): VigenciaBloqueo {
  const intervalos = zonas.map(zona => intervaloBloqueo(datos, zona));
  if (intervalos.some(intervalo => intervalo.inicio <= ahora && ahora < intervalo.fin)) return 'vigente';
  if (intervalos.some(intervalo => ahora < intervalo.inicio)) return 'proximo';
  return 'anterior';
}

/** El filtro civil también usa el fin exclusivo en cada huso de las sedes incluidas. */
export function solapaPeriodoBloqueo(datos: FechasBloqueo, zonas: string[], desde?: string, hasta?: string) {
  if (!desde && !hasta) return true;
  return zonas.some(zona => {
    const intervalo = intervaloBloqueo(datos, zona);
    const inicio = desde ? resolverInstanteLocal(desde, 0, zona) : null;
    const fin = hasta ? resolverInstanteLocal(siguienteDia(hasta), 0, zona) : null;
    return (!inicio || intervalo.fin > inicio) && (!fin || intervalo.inicio < fin);
  });
}

function siguienteDia(fecha: string) {
  return new Date(Date.parse(`${fecha}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
}
