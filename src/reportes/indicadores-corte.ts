import type { CorteReporte } from './entities/corte-reporte.entity';
import type { FilaCorteReporte } from './entities/fila-corte-reporte.entity';

type FilaIndicadores = Pick<FilaCorteReporte, 'fechaCivil' | 'finUtc' | 'estado' | 'origen' |
  'servicioId' | 'nombreServicio' | 'sucursalId' | 'nombreSucursal' | 'costoAceptado' | 'causaCancelacion'>;
type Agrupacion = CorteReporte['filtros']['agrupacion'];

const contarEstados = () => ({ pendiente: 0, confirmada: 0, completada: 0, cancelada: 0, no_asistio: 0 });
const estimacionVacia = () => ({ centavos: 0n, sinCosto: 0 });
type Estimacion = ReturnType<typeof estimacionVacia>;
type Evolucion = { totalCitas: number; estados: ReturnType<typeof contarEstados> };
type Solicitudes = { nombres: Set<string>; cantidad: number };
type EstimacionAgrupada = Estimacion & { nombres: Set<string> };

/** La fecha civil ya está resuelta en la zona histórica. La aritmética UTC solo mueve días de calendario. */
function inicioPeriodo(fechaCivil: string, agrupacion: Agrupacion): string {
  if (agrupacion === 'mes') return `${fechaCivil.slice(0, 7)}-01`;
  const fecha = new Date(`${fechaCivil}T00:00:00Z`);
  fecha.setUTCDate(fecha.getUTCDate() - (fecha.getUTCDay() + 6) % 7);
  return fecha.toISOString().slice(0, 10);
}

function porcentaje(numerador: number, denominador: number): number | null {
  // Sin denominador, el consumidor presenta «Sin datos». Un cero calculado se conserva como tal.
  return denominador === 0 ? null : Math.round(numerador * 10_000 / denominador) / 100;
}

function agruparPorId<T extends { nombres: Set<string> }>(
  grupos: Map<number, T>, id: number, nombre: string | null, nuevo: () => T,
): T {
  let grupo = grupos.get(id);
  if (!grupo) {
    grupo = nuevo();
    grupos.set(id, grupo);
  }
  // Un cambio de nombre añade una denominación, sin dividir el grupo ni recurrir al catálogo.
  if (nombre !== null) grupo.nombres.add(nombre);
  return grupo;
}

function sumarCosto(estimacion: Estimacion, centavos: bigint | null): void {
  if (centavos === null) estimacion.sinCosto += 1;
  else estimacion.centavos += centavos;
}

function costoEnCentavos(costo: string | null): bigint | null {
  if (costo === null) return null;
  // DECIMAL(10,2) llega como texto. Mantener enteros evita redondeos binarios al sumar.
  const [entero, decimal = ''] = costo.split('.');
  return BigInt(entero) * 100n + BigInt(decimal.padEnd(2, '0'));
}

function presentarEstimacion({ centavos, sinCosto }: Estimacion) {
  return {
    subtotalConocido: `${centavos / 100n}.${String(centavos % 100n).padStart(2, '0')}`,
    sinCosto,
    incompleta: sinCosto > 0,
  };
}

function presentarDesglose(grupos: Map<number, EstimacionAgrupada>) {
  return [...grupos].sort(([a], [b]) => a - b)
    .map(([id, grupo]) => ({ id, nombres: [...grupo.nombres].sort(), ...presentarEstimacion(grupo) }));
}

const nuevaEstimacionAgrupada = () => ({ ...estimacionVacia(), nombres: new Set<string>() });
const nuevasSolicitudes = () => ({ cantidad: 0, nombres: new Set<string>() });

/** Recorre cada cita materializada una vez. Los acumulados nunca consultan citas ni catálogos vigentes. */
export async function calcularIndicadores(corte: Pick<CorteReporte, 'fechaCorte' | 'filtros'>,
  filas: AsyncIterable<FilaIndicadores>) {
  const estados = contarEstados();
  const origen = { manual: 0, portal_publico: 0 };
  const evolucion = new Map<string, Evolucion>();
  const servicios = new Map<number, Solicitudes>();
  const estimacion = estimacionVacia();
  const porServicio = new Map<number, EstimacionAgrupada>();
  const porSucursal = new Map<number, EstimacionAgrupada>();
  let totalCitas = 0;
  let pasadasSinResultado = 0;
  let cancelacionesAutomaticas = 0;

  for await (const fila of filas) {
    const { estado, fechaCivil, servicioId, nombreServicio, sucursalId, nombreSucursal } = fila;
    totalCitas += 1;
    estados[estado] += 1;
    origen[fila.origen] += 1;
    agruparPorId(servicios, servicioId, nombreServicio, nuevasSolicitudes).cantidad += 1;

    const periodo = inicioPeriodo(fechaCivil, corte.filtros.agrupacion);
    const bloque = evolucion.get(periodo) ?? { totalCitas: 0, estados: contarEstados() };
    bloque.totalCitas += 1;
    bloque.estados[estado] += 1;
    evolucion.set(periodo, bloque);

    // La fecha de corte fija el límite de «pasada» y la causa vigente define el subconjunto automático.
    if ((estado === 'pendiente' || estado === 'confirmada') && fila.finUtc <= corte.fechaCorte) {
      pasadasSinResultado += 1;
    }
    if (estado === 'cancelada' && fila.causaCancelacion === 'falta_confirmacion_plazo') {
      cancelacionesAutomaticas += 1;
    }
    if (estado === 'completada') {
      const centavos = costoEnCentavos(fila.costoAceptado);
      sumarCosto(estimacion, centavos);
      sumarCosto(agruparPorId(porServicio, servicioId, nombreServicio, nuevaEstimacionAgrupada), centavos);
      sumarCosto(agruparPorId(porSucursal, sucursalId, nombreSucursal, nuevaEstimacionAgrupada), centavos);
    }
  }

  const proporcionOrigen = (cantidad: number) => ({ cantidad, porcentaje: porcentaje(cantidad, totalCitas) });
  const denominadoresTasas = { inasistencia: estados.completada + estados.no_asistio, cancelacion: totalCitas };
  return {
    fechaCorte: corte.fechaCorte,
    totalCitas,
    estados,
    origen: { manual: proporcionOrigen(origen.manual), portal_publico: proporcionOrigen(origen.portal_publico) },
    evolucion: [...evolucion].sort(([a], [b]) => a.localeCompare(b))
      .map(([inicioPeriodo, bloque]) => ({ inicioPeriodo, ...bloque })),
    serviciosSolicitados: [...servicios].map(([servicioId, { cantidad, nombres }]) =>
      ({ servicioId, cantidad, nombres: [...nombres].sort() }))
      .sort((a, b) => b.cantidad - a.cantidad || a.servicioId - b.servicioId),
    tasaInasistencia: porcentaje(estados.no_asistio, denominadoresTasas.inasistencia),
    tasaCancelacion: porcentaje(estados.cancelada, denominadoresTasas.cancelacion),
    denominadoresTasas,
    pasadasSinResultado,
    cancelacionesAutomaticas,
    ingresosEstimados: {
      ...presentarEstimacion(estimacion),
      porServicio: presentarDesglose(porServicio).map(({ id, ...grupo }) => ({ servicioId: id, ...grupo })),
      porSucursal: presentarDesglose(porSucursal).map(({ id, ...grupo }) => ({ sucursalId: id, ...grupo })),
    },
  };
}
