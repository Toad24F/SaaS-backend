import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { RELOJ, type Reloj } from '../comun/reloj';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { validarFechaLocal } from '../horarios/calendario';
import { ContextoDisponibilidadService } from './contexto-disponibilidad.service';
import { ConfiguracionAgendaService } from './configuracion-agenda.service';
import { OfertaEfectivaService } from './oferta-efectiva.service';
import { AtencionInternaService } from './atencion-interna.service';
import { OcupacionesService, ocupacionesQueSeEmpalman } from './ocupaciones.service';
import { cabeEnAtencion, iniciosAnclados,
  type ProyeccionAtencion } from './proyeccion-atencion';
import type { ResultadoDisponibilidad, Ocupacion } from './contratos-internos';
import type { ValoresConfiguracionAgenda } from './configuracion-agenda.validador';

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
  ahora: Date, hoyLocal: string, zonaHoraria: string):
    Array<{ inicioUtc: Date; finUtc: Date }> {
  const duracion = duracionMinutos * 60000;
  return iniciosAnclados(atencion.bloques, atencion.tramos,
    reglas.intervaloMinutos, duracionMinutos).flatMap((inicioUtc) => {
    const finUtc = new Date(inicioUtc.getTime() + duracion);
    // La fecha civil del inicio se evalúa en la zona de la sucursal solicitada.
    const fechaLocal = fechaEnZona(inicioUtc, zonaHoraria);
    if (!dentroDeLimites(inicioUtc, fechaLocal, hoyLocal, ahora, reglas) ||
      !cabeEnAtencion(atencion.tramos, sucursalId, inicioUtc, finUtc) ||
      ocupacionesQueSeEmpalman(ocupaciones, inicioUtc, finUtc).length) return [];
    return [{ inicioUtc, finUtc }];
  });
}

/** Hasta T049, la agenda compacta inicia grupos solo en tramos sin referencias. */
function primerosGrupos(atencion: ProyeccionAtencion, ocupaciones: Ocupacion[],
  candidatos: Array<{ inicioUtc: Date; finUtc: Date }>) {
  const elegidos = new Map<number, { inicioUtc: Date; finUtc: Date }>();
  for (const tramo of atencion.tramos) {
    if (ocupacionesQueSeEmpalman(ocupaciones, tramo.inicioUtc, tramo.finUtc).length) {
      continue;
    }
    const primero = candidatos.find((candidato) =>
      candidato.inicioUtc >= tramo.inicioUtc && candidato.inicioUtc < tramo.finUtc);
    if (primero) elegidos.set(primero.inicioUtc.getTime(), primero);
  }
  return [...elegidos.values()].sort((a, b) =>
    a.inicioUtc.getTime() - b.inicioUtc.getTime());
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
    sucursalId: number, servicioId: number, desde: string, hasta: string):
    Promise<ResultadoDisponibilidad> {
    validarFechaLocal(desde);
    validarFechaLocal(hasta);
    const dias = (Date.parse(`${hasta}T00:00:00Z`) -
      Date.parse(`${desde}T00:00:00Z`)) / 86400000;
    if (dias < 0 || dias >= 31) {
      throw new BadRequestException('Rango de disponibilidad inválido.');
    }
    // El reloj se lee una vez antes de abrir la lectura REPEATABLE READ.
    const ahora = this.reloj.ahora();
    return this.db.transaction('REPEATABLE READ', async (manager) => {
      const contexto = await this.contextos.resolver(manager, token, personalId, ahora);
      const reglas = await this.configuracion.consultarEnContexto(contexto);
      const oferta = await this.oferta.consultar(contexto, sucursalId,
        servicioId, 'publica');
      if (!Number.isSafeInteger(oferta.duracionMinutos) ||
        oferta.duracionMinutos <= 0) {
        throw new Error('Duración de servicio inválida.');
      }
      const resultado: ResultadoDisponibilidad = { negocioId: contexto.negocioId,
        personalId, sucursalId, servicioId, desde, hasta,
        zonaHoraria: oferta.zonaHoraria, calculadoEn: ahora,
        modalidad: 'publica', reglas, ranuras: [], omisiones: [] };
      if (!oferta.ofrecido) return resultado;
      const atencion = await this.atencion.consultar(contexto, sucursalId, desde, hasta);
      resultado.omisiones = atencion.omisiones.map(({ fechaLocal, motivo }) =>
        ({ fechaLocal, motivo }));
      if (!atencion.bloques.length) return resultado;
      const desdeUtc = new Date(Math.min(...atencion.bloques.map((b) =>
        b.inicioUtc.getTime())));
      const hastaUtc = new Date(Math.max(...atencion.bloques.map((b) =>
        b.finUtc.getTime())));
      const ocupaciones = await this.ocupaciones.consultar(contexto, desdeUtc, hastaUtc);
      const hoyLocal = fechaEnZona(ahora, oferta.zonaHoraria);
      const candidatos = candidatosValidos(atencion, ocupaciones, sucursalId,
        oferta.duracionMinutos, reglas, ahora, hoyLocal, oferta.zonaHoraria);
      resultado.ranuras = reglas.modo === 'ventana_libre' ? candidatos :
        primerosGrupos(atencion, ocupaciones, candidatos);
      return resultado;
    });
  }
}
