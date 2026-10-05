import { BadRequestException } from '@nestjs/common';
import type { DatosFranja } from './validar-franja';

export interface IntervaloReal {
  inicio: Date;
  fin: Date;
}
export interface IntervaloAsignado extends IntervaloReal { fila: number }
export interface ExcepcionCalendario {
  sucursalId: number;
  fechaLocal: string;
  franjas: Pick<DatosFranja, 'inicioMinutos' | 'finMinutos'>[];
}

const formateadores = new Map<string, Intl.DateTimeFormat>();
function formateador(zona: string): Intl.DateTimeFormat {
  let actual = formateadores.get(zona);
  if (!actual) {
    try {
      actual = new Intl.DateTimeFormat('en-US', { timeZone: zona,
        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit',
        minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
      actual.format(new Date());
    } catch { throw new BadRequestException('zonaHoraria: zona IANA inválida.'); }
    formateadores.set(zona, actual);
  }
  return actual;
}

function piezas(instante: number, zona: string) {
  const partes = Object.fromEntries(formateador(zona).formatToParts(instante)
    .filter((p) => p.type !== 'literal').map((p) => [p.type, Number(p.value)]));
  return { anio: partes.year, mes: partes.month, dia: partes.day,
    hora: partes.hour, minuto: partes.minute, segundo: partes.second };
}

function fechaUtc(fecha: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    throw new BadRequestException('fechaLocal: se requiere AAAA-MM-DD.');
  }
  const instante = Date.parse(`${fecha}T00:00:00.000Z`);
  if (!Number.isFinite(instante) || new Date(instante).toISOString().slice(0, 10) !== fecha) {
    throw new BadRequestException('fechaLocal: fecha inválida.');
  }
  return instante;
}

/** Valida una fecha local aun cuando una excepción no contenga franjas. */
export function validarFechaLocal(fecha: string): void { fechaUtc(fecha); }

/** Encuentra todas las ocurrencias UTC de una pared local; cero y dos son errores. */
function instanteLocal(fecha: string, minuto: number, zona: string): number | null {
  const base = fechaUtc(fecha) + minuto * 60000;
  const objetivo = new Date(base);
  const offsets = new Set<number>();
  // Se muestrean ambos lados del día para incluir desplazamientos estacionales.
  for (let paso = -3; paso <= 3; paso += 1) {
    const muestra = base + paso * 12 * 3600000;
    const p = piezas(muestra, zona);
    offsets.add((Date.UTC(p.anio, p.mes - 1, p.dia, p.hora, p.minuto, p.segundo)
      - muestra) / 60000);
  }
  const candidatos = [...offsets].map((offset) => base - offset * 60000)
    .filter((valor) => {
      const p = piezas(valor, zona);
      return p.anio === objetivo.getUTCFullYear() && p.mes === objetivo.getUTCMonth() + 1 &&
        p.dia === objetivo.getUTCDate() && p.hora === objetivo.getUTCHours() &&
        p.minuto === objetivo.getUTCMinutes();
    });
  return candidatos.length === 1 ? candidatos[0] : null;
}

/** Resuelve un extremo civil explícito sin elegir arbitrariamente una hora DST. */
export function resolverInstanteLocal(fecha: string, minuto: number, zona: string): Date {
  if (!Number.isInteger(minuto) || minuto < 0 || minuto > 1439) {
    throw new BadRequestException('minuto: fuera del día local.');
  }
  const instante = instanteLocal(fecha, minuto, zona);
  if (instante === null) {
    throw new BadRequestException('Hora local inexistente o repetida por cambio de huso.');
  }
  return new Date(instante);
}

/** Un extremo 24:00 es la medianoche del día siguiente, sin prolongar la franja. */
export function resolverIntervaloLocal(fecha: string, zona: string, inicioMinutos: number,
  finMinutos: number, modo: 'estricto' | 'recurrencia' = 'estricto'): IntervaloReal | null {
  const base = fechaUtc(fecha);
  if (!Number.isInteger(inicioMinutos) || inicioMinutos < 0 || inicioMinutos >= 1440 ||
    !Number.isInteger(finMinutos) || finMinutos <= inicioMinutos || finMinutos > 1440) {
    throw new BadRequestException('inicioMinutos/finMinutos: intervalo local inválido.');
  }
  const fechaFin = finMinutos === 1440
    ? new Date(base + 86400000).toISOString().slice(0, 10) : fecha;
  const inicio = instanteLocal(fecha, inicioMinutos, zona);
  const fin = instanteLocal(fechaFin, finMinutos === 1440 ? 0 : finMinutos, zona);
  // La duración distinta revela una discontinuidad dentro de la franja aunque
  // ambos extremos sean horas locales existentes y no repetidas.
  if (inicio === null || fin === null || fin - inicio !== (finMinutos - inicioMinutos) * 60000) {
    if (modo === 'recurrencia') return null;
    throw new BadRequestException('inicioMinutos/finMinutos: hora local inexistente, repetida o discontinuidad.');
  }
  return { inicio: new Date(inicio), fin: new Date(fin) };
}

/** Intervalos semiabiertos: los límites consecutivos son compatibles. */
export function detectarEmpalme(intervalos: IntervaloAsignado[]): [number, number] | null {
  const ordenados = [...intervalos].sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
  for (let i = 1; i < ordenados.length; i += 1) {
    if (ordenados[i].inicio < ordenados[i - 1].fin) {
      return [ordenados[i - 1].fila, ordenados[i].fila];
    }
  }
  return null;
}

/** Revisa un ciclo anual completo y las fechas excepcionales con días vecinos. */
export function validarRecurrencias(semana: DatosFranja[], excepciones: ExcepcionCalendario[],
  zonas: Map<number, string>, desde: string): { filas: [number, number] } | null {
  const inicio = fechaUtc(desde);
  const fechas = new Set<string>();
  for (let dias = 0; dias < 400; dias += 1) {
    fechas.add(new Date(inicio + dias * 86400000).toISOString().slice(0, 10));
  }
  for (const excepcion of excepciones) {
    const base = fechaUtc(excepcion.fechaLocal);
    for (let dias = -2; dias <= 2; dias += 1) {
      fechas.add(new Date(base + dias * 86400000).toISOString().slice(0, 10));
    }
  }
  const reemplazos = new Map(excepciones.map((e) => [`${e.sucursalId}:${e.fechaLocal}`, e]));
  const intervalos: IntervaloAsignado[] = [];
  for (const fecha of fechas) {
    const dia = new Date(`${fecha}T00:00:00.000Z`).getUTCDay();
    semana.forEach((franja, fila) => {
      if (!franja.activo || franja.diaSemana !== dia || franja.sucursalId == null ||
        reemplazos.has(`${franja.sucursalId}:${fecha}`)) return;
      const zona = zonas.get(franja.sucursalId);
      if (!zona) throw new BadRequestException(`fila ${fila}, sucursalId: zona no disponible.`);
      const intervalo = resolverIntervaloLocal(fecha, zona, franja.inicioMinutos!,
        franja.finMinutos!, 'recurrencia');
      if (intervalo) intervalos.push({ ...intervalo, fila });
    });
    excepciones.forEach((excepcion, indice) => {
      if (excepcion.fechaLocal !== fecha) return;
      const zona = zonas.get(excepcion.sucursalId);
      if (!zona) throw new BadRequestException(`excepción ${indice}, sucursalId: zona no disponible.`);
      excepcion.franjas.forEach((franja) => {
        const intervalo = resolverIntervaloLocal(fecha, zona, franja.inicioMinutos!,
          franja.finMinutos!);
        intervalos.push({ ...intervalo!, fila: semana.length + indice });
      });
    });
  }
  const filas = detectarEmpalme(intervalos);
  return filas ? { filas } : null;
}
