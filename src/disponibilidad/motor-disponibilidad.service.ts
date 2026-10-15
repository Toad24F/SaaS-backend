import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { RELOJ, type Reloj } from '../comun/reloj';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { resolverInstanteLocal, validarFechaLocal } from '../horarios/calendario';
import { ContextoDisponibilidadService } from './contexto-disponibilidad.service';
import { ConfiguracionAgendaService } from './configuracion-agenda.service';
import { OfertaEfectivaService } from './oferta-efectiva.service';
import { AtencionInternaService } from './atencion-interna.service';
import { OcupacionesService, ocupacionesQueSeEmpalman } from './ocupaciones.service';
import { cabeEnAtencion, iniciosAnclados,
  type ProyeccionAtencion } from './proyeccion-atencion';
import type { ResultadoDisponibilidad, Ocupacion } from './contratos-internos';
import type { ValoresConfiguracionAgenda } from './configuracion-agenda.validador';
import { seleccionarCompactas } from './seleccion-compacta';

type Modalidad = 'publica' | 'manual';
type Ranura = { inicioUtc: Date; finUtc: Date };
type OfertaLeida = Awaited<ReturnType<OfertaEfectivaService['consultar']>>;

function validarModalidad(modalidad: string): asserts modalidad is Modalidad {
  if (modalidad !== 'publica' && modalidad !== 'manual') {
    throw new BadRequestException('Modalidad de disponibilidad inválida.');
  }
}

function fechaEnZona(instante: Date, zonaHoraria: string): string {
  const partes = new Intl.DateTimeFormat('en-US', { timeZone: zonaHoraria,
    year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(instante);
  const valor = (tipo: string) => partes.find((parte) => parte.type === tipo)!.value;
  return `${valor('year')}-${valor('month')}-${valor('day')}`;
}

/** Aplica límites comerciales a la fecha de la sucursal, no a la fecha UTC. */
function dentroDeLimites(inicioUtc: Date, fechaLocal: string, hoyLocal: string,
  ahora: Date, reglas: ValoresConfiguracionAgenda): boolean {
  const distancia = (Date.parse(`${fechaLocal}T00:00:00Z`) -
    Date.parse(`${hoyLocal}T00:00:00Z`)) / 86400000;
  return distancia >= 0 && distancia <= reglas.diasFuturos &&
    inicioUtc.getTime() >= ahora.getTime() + reglas.anticipacionMinutos * 60000;
}

/** Filtra intervalos completos; un extremo igual al de otra ocupación es válido. */
function candidatosValidos(atencion: ProyeccionAtencion, ocupaciones: Ocupacion[],
  sucursalId: number, duracionMinutos: number, reglas: ValoresConfiguracionAgenda,
  ahora: Date, hoyLocal: string, zonaHoraria: string, modalidad: Modalidad): Ranura[] {
  const duracion = duracionMinutos * 60000;
  return iniciosAnclados(atencion.bloques, atencion.tramos,
    modalidad === 'manual' ? 1 : reglas.intervaloMinutos, duracionMinutos)
    .flatMap((inicioUtc) => {
    const finUtc = new Date(inicioUtc.getTime() + duracion);
    // La fecha civil del inicio se evalúa en la zona de la sucursal solicitada.
    const fechaLocal = fechaEnZona(inicioUtc, zonaHoraria);
    if ((modalidad === 'publica' &&
      !dentroDeLimites(inicioUtc, fechaLocal, hoyLocal, ahora, reglas)) ||
      (modalidad === 'manual' && inicioUtc < ahora) ||
      !cabeEnAtencion(atencion.tramos, sucursalId, inicioUtc, finUtc) ||
      ocupacionesQueSeEmpalman(ocupaciones, inicioUtc, finUtc).length) return [];
    return [{ inicioUtc, finUtc }];
  });
}

interface LecturaMotor {
  resultado: ResultadoDisponibilidad;
  oferta: OfertaLeida;
  atencion: ProyeccionAtencion;
  ocupaciones: Ocupacion[];
}

/** Orquesta una sola instantánea de configuración, oferta, atención y ocupaciones. */
@Injectable()
export class MotorDisponibilidadService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    @Inject(RELOJ) private readonly reloj: Reloj,
    private readonly contextos: ContextoDisponibilidadService,
    private readonly configuracion: ConfiguracionAgendaService,
    private readonly oferta: OfertaEfectivaService,
    private readonly atencion: AtencionInternaService,
    private readonly ocupaciones: OcupacionesService,
  ) {}

  async consultar(token: Pick<JwtPayload, 'sub' | 'sesionId'>, personalId: number,
    sucursalId: number, servicioId: number, desde: string, hasta: string,
    modalidad: Modalidad = 'publica'):
    Promise<ResultadoDisponibilidad> {
    validarModalidad(modalidad);
    validarFechaLocal(desde);
    validarFechaLocal(hasta);
    const dias = (Date.parse(`${hasta}T00:00:00Z`) -
      Date.parse(`${desde}T00:00:00Z`)) / 86400000;
    if (dias < 0 || dias >= 31) {
      throw new BadRequestException('Rango de disponibilidad inválido.');
    }
    // El reloj se lee una vez antes de abrir la lectura REPEATABLE READ.
    const ahora = this.reloj.ahora();
    return this.db.transaction('REPEATABLE READ', async (manager) =>
      (await this.calcular(manager, token, personalId, sucursalId, servicioId,
        desde, hasta, modalidad, ahora)).resultado);
  }

  /** Usa el mismo cálculo y la misma instantánea para validar un inicio preciso. */
  async validar(token: Pick<JwtPayload, 'sub' | 'sesionId'>, personalId: number,
    sucursalId: number, servicioId: number, fechaLocal: string,
    horaInicio: string, modalidad: Modalidad = 'publica') {
    validarModalidad(modalidad);
    validarFechaLocal(fechaLocal);
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(horaInicio)) {
      throw new BadRequestException('Hora de inicio inválida.');
    }
    const ahora = this.reloj.ahora();
    return this.db.transaction('REPEATABLE READ', async (manager) => {
      const lectura = await this.calcular(manager, token, personalId, sucursalId,
        servicioId, fechaLocal, fechaLocal, modalidad, ahora);
      const { resultado, oferta, atencion, ocupaciones } = lectura;
      const [horas, minutos] = horaInicio.split(':').map(Number);
      const inicioUtc = resolverInstanteLocal(fechaLocal,
        horas * 60 + minutos, oferta.zonaHoraria);
      const finUtc = new Date(inicioUtc.getTime() + oferta.duracionMinutos * 60000);
      const motivos: string[] = [...oferta.motivosExclusion];
      // La negativa funcional informa causas sin crear ni modificar ocupaciones.
      if (modalidad === 'manual' && inicioUtc < ahora) motivos.push('inicio_pasado');
      if (modalidad === 'publica') {
        const hoyLocal = fechaEnZona(ahora, oferta.zonaHoraria);
        const dias = (Date.parse(`${fechaLocal}T00:00:00Z`) -
          Date.parse(`${hoyLocal}T00:00:00Z`)) / 86400000;
        if (dias < 0 || dias > resultado.reglas.diasFuturos) {
          motivos.push('fuera_de_horizonte');
        }
        if (inicioUtc.getTime() < ahora.getTime() +
          resultado.reglas.anticipacionMinutos * 60000) {
          motivos.push('anticipacion_insuficiente');
        }
      }
      if (oferta.ofrecido) {
        if (!cabeEnAtencion(atencion.tramos, sucursalId, inicioUtc, finUtc)) {
          motivos.push('fuera_de_atencion');
        }
        if (ocupacionesQueSeEmpalman(ocupaciones, inicioUtc, finUtc).length) {
          motivos.push('ocupado');
        }
        if (modalidad === 'publica' && atencion.bloques.some((bloque) =>
          inicioUtc >= bloque.inicioUtc && inicioUtc < bloque.finUtc) &&
          !atencion.bloques.some((bloque) => inicioUtc >= bloque.inicioUtc &&
            inicioUtc < bloque.finUtc &&
            (inicioUtc.getTime() - bloque.inicioUtc.getTime()) %
              (resultado.reglas.intervaloMinutos * 60000) === 0)) {
          motivos.push('fuera_de_secuencia');
        }
      }
      const ofrecido = resultado.ranuras.some((ranura) =>
        ranura.inicioUtc.getTime() === inicioUtc.getTime());
      if (!motivos.length && !ofrecido) motivos.push('no_ofrecido_por_estrategia');
      return { valido: motivos.length === 0, inicioUtc, finUtc,
        zonaHoraria: oferta.zonaHoraria, modalidad, motivos };
    });
  }

  /** Todos los lectores reciben el mismo manager y el instante ya capturado. */
  private async calcular(manager: EntityManager,
    token: Pick<JwtPayload, 'sub' | 'sesionId'>, personalId: number,
    sucursalId: number, servicioId: number, desde: string, hasta: string,
    modalidad: Modalidad, ahora: Date): Promise<LecturaMotor> {
    const contexto = await this.contextos.resolver(manager, token, personalId, ahora);
    const reglas = await this.configuracion.consultarEnContexto(contexto);
    const oferta = await this.oferta.consultar(contexto, sucursalId,
      servicioId, modalidad);
    if (!Number.isSafeInteger(oferta.duracionMinutos) ||
      oferta.duracionMinutos <= 0) {
      throw new Error('Duración de servicio inválida.');
    }
    const resultado: ResultadoDisponibilidad = { negocioId: contexto.negocioId,
      personalId, sucursalId, servicioId, desde, hasta,
      zonaHoraria: oferta.zonaHoraria, calculadoEn: ahora,
      modalidad, reglas, ranuras: [], omisiones: [] };
    const atencion: ProyeccionAtencion = { bloques: [], tramos: [], omisiones: [] };
    const ocupaciones: Ocupacion[] = [];
    if (!oferta.ofrecido) return { resultado, oferta, atencion, ocupaciones };
    const proyeccion = await this.atencion.consultar(contexto, sucursalId, desde, hasta);
    resultado.omisiones = proyeccion.omisiones.map(({ fechaLocal, motivo }) =>
      ({ fechaLocal, motivo }));
    if (!proyeccion.bloques.length) {
      return { resultado, oferta, atencion: proyeccion, ocupaciones };
    }
    const desdeUtc = new Date(Math.min(...proyeccion.bloques.map((b) =>
      b.inicioUtc.getTime())));
    const hastaUtc = new Date(Math.max(...proyeccion.bloques.map((b) =>
      b.finUtc.getTime())));
    ocupaciones.push(...await this.ocupaciones.consultar(contexto, desdeUtc, hastaUtc));
    const hoyLocal = fechaEnZona(ahora, oferta.zonaHoraria);
    const candidatos = candidatosValidos(proyeccion, ocupaciones, sucursalId,
      oferta.duracionMinutos, reglas, ahora, hoyLocal, oferta.zonaHoraria, modalidad);
    resultado.ranuras = modalidad === 'manual' || reglas.modo === 'ventana_libre'
      ? candidatos : seleccionarCompactas(proyeccion.tramos, ocupaciones,
        candidatos, reglas.intervaloMinutos, oferta.duracionMinutos);
    return { resultado, oferta, atencion: proyeccion, ocupaciones };
  }
}
