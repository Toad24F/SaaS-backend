import { resolverIntervaloLocal } from '../horarios/calendario';
import { restarRestricciones, type Intervalo } from '../bloqueos/calculo-bloqueos';
import type { BloqueOriginal, TramoEfectivo } from './contratos-internos';

export interface FranjaFuente {
  id: number;
  inicioMinutos: number;
  finMinutos: number;
  descansoInicioMinutos: number | null;
  descansoFinMinutos: number | null;
}
export interface FranjaSemanalFuente extends FranjaFuente {
  sucursalId: number;
  diaSemana: number;
}
export interface ExcepcionFuente {
  sucursalId: number;
  fechaLocal: string;
  franjas: FranjaFuente[];
}
export interface FranjaElegida extends FranjaFuente {
  origen: 'semanal' | 'excepcion';
}
export interface OmisionAtencion {
  fechaLocal: string;
  sucursalId: number;
  motivo: string;
}
export interface ProyeccionAtencion {
  bloques: BloqueOriginal[];
  tramos: TramoEfectivo[];
  descansos: Array<{ bloqueId: number; origen: 'semanal' | 'excepcion';
    inicioUtc: Date; finUtc: Date }>;
  omisiones: OmisionAtencion[];
}

/** La cabecera de excepción sustituye solo esa fecha y sede, aun sin franjas. */
export function seleccionarFranjas(fechaLocal: string, sucursalId: number,
  semana: FranjaSemanalFuente[], excepciones: ExcepcionFuente[]): FranjaElegida[] {
  const especial = excepciones.find((e) => e.fechaLocal === fechaLocal &&
    e.sucursalId === sucursalId);
  if (especial) return especial.franjas.map((franja) => ({ ...franja, origen: 'excepcion' }));
  const diaSemana = new Date(`${fechaLocal}T00:00:00.000Z`).getUTCDay();
  return semana.filter((franja) => franja.sucursalId === sucursalId &&
    franja.diaSemana === diaSemana).map((franja) => ({ ...franja, origen: 'semanal' }));
}

/** Los cortes restan tiempo, pero cada tramo retiene el bloque que ancla sus inicios. */
export function proyectarAtencion(fechaLocal: string, sucursalId: number, zonaHoraria: string,
  semana: FranjaSemanalFuente[], excepciones: ExcepcionFuente[],
  restricciones: Intervalo[]): ProyeccionAtencion {
  const resultado: ProyeccionAtencion = { bloques: [], tramos: [], descansos: [], omisiones: [] };
  for (const franja of seleccionarFranjas(fechaLocal, sucursalId, semana, excepciones)) {
    // La recurrencia afectada por DST se omite; un extremo explícito inválido se rechaza.
    const modo = franja.origen === 'semanal' ? 'recurrencia' : 'estricto';
    const jornada = resolverIntervaloLocal(fechaLocal, zonaHoraria,
      franja.inicioMinutos, franja.finMinutos, modo);
    if (!jornada) {
      resultado.omisiones.push({ fechaLocal, sucursalId,
        motivo: 'Hora local inexistente o repetida.' });
      continue;
    }
    let descanso: Intervalo | null = null;
    if (franja.descansoInicioMinutos !== null && franja.descansoFinMinutos !== null) {
      descanso = resolverIntervaloLocal(fechaLocal, zonaHoraria,
        franja.descansoInicioMinutos, franja.descansoFinMinutos, modo);
      if (!descanso) {
        resultado.omisiones.push({ fechaLocal, sucursalId,
          motivo: 'Descanso local inexistente o repetido.' });
        continue;
      }
    }
    const bloque: BloqueOriginal = { id: franja.id, origen: franja.origen, fechaLocal,
      sucursalId, zonaHoraria, inicioUtc: jornada.inicio, finUtc: jornada.fin };
    resultado.bloques.push(bloque);
    // La procedencia del descanso permite explicar citas afectadas sin inferirla
    // desde un tramo ya recortado por otros bloqueos.
    if (descanso) resultado.descansos.push({ bloqueId: franja.id,
      origen: franja.origen, inicioUtc: descanso.inicio, finUtc: descanso.fin });
    const cortes = descanso ? [descanso, ...restricciones] : restricciones;
    for (const tramo of restarRestricciones([jornada], cortes)) {
      resultado.tramos.push({ bloque, inicioUtc: tramo.inicio, finUtc: tramo.fin });
    }
  }
  resultado.bloques.sort((a, b) => a.inicioUtc.getTime() - b.inicioUtc.getTime() || a.id - b.id);
  resultado.tramos.sort((a, b) => a.inicioUtc.getTime() - b.inicioUtc.getTime() ||
    a.bloque.id - b.bloque.id);
  return resultado;
}

/** Comprueba una cita completa sobre la unión continua de tramos de una sola sede. */
export function cabeEnAtencion(tramos: TramoEfectivo[], sucursalId: number,
  inicioUtc: Date, finUtc: Date): boolean {
  const inicio = inicioUtc.getTime();
  const fin = finUtc.getTime();
  if (!Number.isFinite(inicio) || !Number.isFinite(fin) || fin <= inicio) return false;
  let cubiertoHasta = inicio;
  for (const tramo of [...tramos].filter((t) => t.bloque.sucursalId === sucursalId)
    .sort((a, b) => a.inicioUtc.getTime() - b.inicioUtc.getTime())) {
    if (tramo.finUtc.getTime() <= cubiertoHasta) continue;
    if (tramo.inicioUtc.getTime() > cubiertoHasta) return false;
    cubiertoHasta = tramo.finUtc.getTime();
    if (cubiertoHasta >= fin) return true;
  }
  return false;
}

/** Genera desde cada anclaje original; ni descansos ni bloqueos reinician la secuencia. */
export function iniciosAnclados(bloques: BloqueOriginal[], tramos: TramoEfectivo[],
  intervaloMinutos: number, duracionMinutos: number): Date[] {
  if (!Number.isSafeInteger(intervaloMinutos) || intervaloMinutos <= 0 ||
    !Number.isSafeInteger(duracionMinutos) || duracionMinutos <= 0) return [];
  const paso = intervaloMinutos * 60000;
  const duracion = duracionMinutos * 60000;
  const inicios = new Set<number>();
  for (const bloque of bloques) {
    for (let t = bloque.inicioUtc.getTime(); t < bloque.finUtc.getTime(); t += paso) {
      if (cabeEnAtencion(tramos, bloque.sucursalId, new Date(t), new Date(t + duracion))) {
        inicios.add(t);
      }
    }
  }
  return [...inicios].sort((a, b) => a - b).map((t) => new Date(t));
}
