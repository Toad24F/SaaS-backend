import type { Cita } from '../disponibilidad/entities/cita.entity';

function formateador(zona: string): Intl.DateTimeFormat {
  // Una zona persistida inválida es corrupción/fallo técnico, nunca una agenda vacía.
  return new Intl.DateTimeFormat('en-US', { timeZone: zona, year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
}
function partes(formato: Intl.DateTimeFormat, instante: number) {
  return Object.fromEntries(formato.formatToParts(instante).filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]));
}

/** Convierte un rango civil semiabierto en intervalos UTC, sin suponer fechas monótonas.
 * Se separan los tramos de offset IANA constante: un retroceso puede volver al día anterior.
 */
export function intervalosCivilesUtc(desde: string, hastaExclusivo: string, zona: string) {
  const inicioCivil = Date.parse(`${desde}T00:00:00Z`);
  const finCivil = Date.parse(`${hastaExclusivo}T00:00:00Z`);
  if (!Number.isFinite(inicioCivil) || !Number.isFinite(finCivil)) throw new Error('Periodo civil interno inválido.');
  const formato = formateador(zona);
  const offsetEn = (instante: number) => {
    const p = partes(formato, instante);
    return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour),
      Number(p.minute), Number(p.second)) - Math.floor(instante / 1000) * 1000;
  };
  const minimo = inicioCivil - 2 * 86400000;
  const maximo = finCivil + 2 * 86400000;
  const intervalos: { inicio: Date; fin: Date }[] = [];
  const agregar = (inicioTramo: number, finTramo: number, offset: number) => {
    const inicio = Math.max(inicioTramo, inicioCivil - offset);
    const fin = Math.min(finTramo, finCivil - offset);
    if (inicio >= fin) return;
    const anterior = intervalos.at(-1);
    if (anterior?.fin.getTime() === inicio) anterior.fin = new Date(fin);
    else intervalos.push({ inicio: new Date(inicio), fin: new Date(fin) });
  };
  let inicioTramo = minimo;
  let offset = offsetEn(minimo);
  // El muestreo de seis horas localiza cambios IANA; la bisección encuentra su milisegundo exacto.
  for (let muestra = minimo; muestra < maximo;) {
    const siguiente = Math.min(maximo, muestra + 6 * 3600000);
    if (offsetEn(siguiente) !== offset) {
      let bajo = muestra;
      let alto = siguiente;
      while (bajo < alto) {
        const medio = bajo + Math.floor((alto - bajo) / 2);
        if (offsetEn(medio) === offset) bajo = medio + 1; else alto = medio;
      }
      agregar(inicioTramo, bajo, offset);
      inicioTramo = bajo;
      offset = offsetEn(bajo);
    }
    muestra = siguiente;
  }
  agregar(inicioTramo, maximo, offset);
  return intervalos;
}

/** Primera aparición del día; si fue omitido, devuelve el inicio de la siguiente fecha existente. */
export function limiteCivilUtc(fecha: string, zona: string): Date {
  const siguiente = new Date(Date.parse(`${fecha}T00:00:00Z`) + 2 * 86400000).toISOString().split('T')[0];
  const primero = intervalosCivilesUtc(fecha, siguiente, zona)[0];
  if (!primero) throw new Error('No se pudo resolver el límite civil.');
  return primero.inicio;
}

/** La zona y ambos extremos proceden del compromiso histórico, sin reconstruir el catálogo. */
export function proyectarHorarioCita(cita: Pick<Cita, 'inicioUtc' | 'finUtc' | 'zonaHorariaReserva'>) {
  const formato = formateador(cita.zonaHorariaReserva);
  const inicio = partes(formato, cita.inicioUtc.getTime());
  const fin = partes(formato, cita.finUtc.getTime());
  const fecha = (p: Record<string, string>) => `${p.year.padStart(4, '0')}-${p.month}-${p.day}`;
  const hora = (p: Record<string, string>) => `${p.hour}:${p.minute}:${p.second}`;
  return { fechaLocal: fecha(inicio), horaInicio: hora(inicio), fechaFinLocal: fecha(fin),
    horaFin: hora(fin), zonaHoraria: cita.zonaHorariaReserva };
}
