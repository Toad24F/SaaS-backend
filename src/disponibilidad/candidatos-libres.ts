import { BadRequestException } from '@nestjs/common';
import type { Intervalo } from '../bloqueos/calculo-bloqueos';
import { resolverInstanteLocal, validarFechaLocal } from '../horarios/calendario';

export interface LimitesCandidatosLibres {
  zonaHoraria: string;
  ahora: Date;
  anticipacionMinutos: number;
  diasFuturos: number;
  desde: string;
  hasta: string;
}

export interface CandidatoLibre { inicioUtc: Date; finUtc: Date }

/** Lee la pared civil de la sede; los múltiplos se calculan allí, no sobre UTC. */
function paredLocal(instante: Date, zonaHoraria: string): number {
  const partes = new Intl.DateTimeFormat('en-US', { timeZone: zonaHoraria,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit',
    minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(instante);
  const valor = (tipo: string) => Number(partes.find((parte) => parte.type === tipo)!.value);
  return Date.UTC(valor('year'), valor('month') - 1, valor('day'),
    valor('hour'), valor('minute'), valor('second'), instante.getUTCMilliseconds());
}

function fechaLocal(instante: Date, zonaHoraria: string): string {
  return new Date(paredLocal(instante, zonaHoraria)).toISOString().slice(0, 10);
}

/** Busca el primer múltiplo local inequívoco igual o posterior al instante. */
export function redondearInicioLocal(limiteUtc: Date, zonaHoraria: string): Date {
  if (!Number.isFinite(limiteUtc.getTime())) {
    throw new BadRequestException('Límite de inicio inválido.');
  }
  const pared = paredLocal(limiteUtc, zonaHoraria);
  let minutoCivil = Math.ceil(pared / 300000) * 300000;
  // Una transición DST puede eliminar o repetir horas civiles completas.
  // Se omiten esos minutos y se comprueba también que el UTC no retroceda.
  for (let intentos = 0; intentos < 576; intentos += 1, minutoCivil += 300000) {
    const civil = new Date(minutoCivil);
    const fecha = civil.toISOString().slice(0, 10);
    const minuto = civil.getUTCHours() * 60 + civil.getUTCMinutes();
    try {
      const resuelto = resolverInstanteLocal(fecha, minuto, zonaHoraria);
      if (resuelto >= limiteUtc) return resuelto;
    } catch (error) {
      if (!(error instanceof BadRequestException)) throw error;
    }
  }
  throw new BadRequestException('No hay inicio local inequívoco en el rango.');
}

/** Produce todas las opciones de Agenda Libre desde cada hueco real. */
export function generarCandidatosLibres(espacios: readonly Intervalo[],
  duracionMinutos: number, separacionMinutos: number,
  limites: LimitesCandidatosLibres): CandidatoLibre[] {
  validarFechaLocal(limites.desde);
  validarFechaLocal(limites.hasta);
  const diasConsulta = (Date.parse(`${limites.hasta}T00:00:00Z`) -
    Date.parse(`${limites.desde}T00:00:00Z`)) / 86400000;
  if (diasConsulta < 0 || diasConsulta >= 31) {
    throw new BadRequestException('Rango de disponibilidad inválido.');
  }
  if (!Number.isSafeInteger(duracionMinutos) || duracionMinutos <= 0 ||
    !Number.isSafeInteger(separacionMinutos) || separacionMinutos < 0 ||
    !Number.isSafeInteger(limites.anticipacionMinutos) ||
    limites.anticipacionMinutos < 0 ||
    !Number.isSafeInteger(limites.diasFuturos) || limites.diasFuturos < 0) {
    throw new BadRequestException('Reglas de disponibilidad inválidas.');
  }
  const duracion = duracionMinutos * 60000;
  const protegido = (duracionMinutos + separacionMinutos) * 60000;
  const minimo = limites.ahora.getTime() + limites.anticipacionMinutos * 60000;
  const hoy = fechaLocal(limites.ahora, limites.zonaHoraria);
  const ultimoDia = new Date(Date.parse(`${hoy}T00:00:00Z`) +
    limites.diasFuturos * 86400000).toISOString().slice(0, 10);
  const candidatos = new Map<number, CandidatoLibre>();
  for (const espacio of espacios) {
    let siguiente = Math.max(espacio.inicio.getTime(), minimo);
    while (siguiente + protegido <= espacio.fin.getTime()) {
      const inicioUtc = redondearInicioLocal(new Date(siguiente), limites.zonaHoraria);
      if (inicioUtc.getTime() + protegido > espacio.fin.getTime()) break;
      const fecha = fechaLocal(inicioUtc, limites.zonaHoraria);
      if (fecha > limites.hasta || fecha > ultimoDia) break;
      if (fecha >= limites.desde && fecha >= hoy) {
        candidatos.set(inicioUtc.getTime(), { inicioUtc,
          finUtc: new Date(inicioUtc.getTime() + duracion) });
      }
      // El redondeo mueve solo el próximo inicio; no amplía el fin protegido.
      siguiente = inicioUtc.getTime() + protegido;
    }
  }
  return [...candidatos.values()].sort((a, b) =>
    a.inicioUtc.getTime() - b.inicioUtc.getTime());
}
