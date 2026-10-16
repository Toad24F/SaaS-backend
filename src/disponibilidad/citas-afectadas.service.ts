import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { Rol } from '../auth/enums/rol.enum';
import { RELOJ, type Reloj } from '../comun/reloj';
import { Personal } from '../profesionales/entities/personal.entity';
import { Sucursal } from '../sucursales/entities/sucursal.entity';
import { Cita } from './entities/cita.entity';
import { ContextoDisponibilidadService, type ContextoDisponibilidad } from './contexto-disponibilidad.service';
import { OfertaEfectivaService } from './oferta-efectiva.service';
import { AtencionInternaService } from './atencion-interna.service';
import { BloqueosAplicablesService } from './bloqueos-aplicables.service';
import { cabeEnAtencion } from './proyeccion-atencion';
import type { ConsultaCitasAfectadasEntrada } from './disponibilidad-entradas';

export interface CausaAfectacion {
  codigo: string;
  referenciaTipo: string | null;
  referenciaId: number | null;
}

function fechaEnZona(instante: Date, zona: string): string {
  const partes = new Intl.DateTimeFormat('en-US', { timeZone: zona,
    year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(instante);
  const valor = (tipo: string) => partes.find((parte) => parte.type === tipo)!.value;
  return `${valor('year')}-${valor('month')}-${valor('day')}`;
}

function empalma(inicio: Date, fin: Date, restriccion: { inicio: Date; fin: Date }): boolean {
  return inicio < restriccion.fin && fin > restriccion.inicio;
}

function causa(codigo: string, referenciaTipo: string | null = null,
  referenciaId: number | null = null): CausaAfectacion {
  return { codigo, referenciaTipo, referenciaId };
}

/** Recalcula causas desde fuentes vigentes sin modificar citas ni ocupaciones. */
@Injectable()
export class CitasAfectadasService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    @Inject(RELOJ) private readonly reloj: Reloj,
    private readonly contextos: ContextoDisponibilidadService,
    private readonly oferta: OfertaEfectivaService,
    private readonly atencion: AtencionInternaService,
    private readonly bloqueos: BloqueosAplicablesService,
  ) {}

  async consultar(token: Pick<JwtPayload, 'sub' | 'sesionId'>,
    entrada: ConsultaCitasAfectadasEntrada) {
    const ahora = this.reloj.ahora();
    return this.db.transaction('REPEATABLE READ', async (manager) => {
      const acceso = await this.contextos.resolverAcceso(manager, token, ahora);
      let personalId = entrada.personalId;
      if (personalId !== undefined) {
        const perfil = await manager.getRepository(Personal).findOneBy({
          id: personalId, negocioId: acceso.negocioId });
        if (!perfil) throw new NotFoundException('Profesional no disponible.');
      }
      if (acceso.rol === Rol.PROFESIONAL) {
        if (personalId !== undefined && personalId !== acceso.actorId) {
          throw new ForbiddenException('Profesional no autorizado.');
        }
        personalId = acceso.actorId;
      }
      const sedes = await manager.getRepository(Sucursal).findBy({
        negocioId: acceso.negocioId });
      const porId = new Map(sedes.map((sede) => [sede.id, sede]));
      if (entrada.sucursalId !== undefined && !porId.has(entrada.sucursalId)) {
        throw new NotFoundException('Sucursal no disponible.');
      }
      // El margen UTC cubre todas las zonas IANA; el filtro definitivo usa la
      // fecha civil de cada sucursal, incluso cuando varias zonas comparten consulta.
      const inicio = new Date(Date.parse(`${entrada.desde}T00:00:00Z`) - 2 * 86400000);
      const fin = new Date(Date.parse(`${entrada.hasta}T00:00:00Z`) + 3 * 86400000);
      const consulta = manager.getRepository(Cita).createQueryBuilder('cita')
        .where('cita.negocio_id = :negocioId', { negocioId: acceso.negocioId })
        .andWhere('cita.estado <> :cancelada', { cancelada: 'cancelada' })
        .andWhere('cita.inicio_utc >= :inicio AND cita.inicio_utc < :fin',
          { inicio, fin })
        .orderBy('cita.inicio_utc', 'ASC').addOrderBy('cita.id', 'ASC');
      if (personalId !== undefined) consulta.andWhere('cita.personal_id = :personalId',
        { personalId });
      if (entrada.sucursalId !== undefined) consulta.andWhere('cita.sucursal_id = :sucursalId',
        { sucursalId: entrada.sucursalId });
      const candidatas = await consulta.getMany();
      const citas = [];
      for (const cita of candidatas) {
        const sede = porId.get(cita.sucursalId);
        if (!sede) throw new Error('Sucursal de cita no disponible.');
        const fechaLocal = fechaEnZona(cita.inicioUtc, sede.zonaHoraria);
        if (fechaLocal < entrada.desde || fechaLocal > entrada.hasta) continue;
        const contexto: ContextoDisponibilidad = { ...acceso,
          personalId: cita.personalId };
        const causas: CausaAfectacion[] = [];
        if (cita.inicioUtc >= ahora) {
          const estado = await this.oferta.consultar(contexto, cita.sucursalId,
            cita.servicioId, 'publica');
          // Solo desactivaciones futuras: reglas comerciales y duración de catálogo
          // no recalculan el intervalo ya comprometido de la cita.
          for (const codigo of estado.motivosExclusion) {
            const referenciaTipo = codigo === 'cuenta_inactiva' ? 'personal' :
              codigo === 'sucursal_inactiva' ? 'sucursal' :
              codigo === 'servicio_inactivo' ? 'servicio' : null;
            const referenciaId = referenciaTipo === 'personal' ? cita.personalId :
              referenciaTipo === 'sucursal' ? cita.sucursalId :
              referenciaTipo === 'servicio' ? cita.servicioId : null;
            causas.push(causa(codigo, referenciaTipo, referenciaId));
          }
        }
        const fechaFinLocal = fechaEnZona(new Date(cita.finUtc.getTime() - 1),
          sede.zonaHoraria);
        const proyeccion = await this.atencion.consultar(contexto, cita.sucursalId,
          fechaLocal, fechaFinLocal);
        const cobertura = proyeccion.bloques.map((bloque) => ({ bloque,
          inicioUtc: bloque.inicioUtc, finUtc: bloque.finUtc }));
        if (!cabeEnAtencion(cobertura, cita.sucursalId,
          cita.inicioUtc, cita.finUtc)) {
          causas.push(causa('horario_insuficiente', 'sucursal', cita.sucursalId));
        }
        for (const descanso of proyeccion.descansos) {
          if (empalma(cita.inicioUtc, cita.finUtc,
            { inicio: descanso.inicioUtc, fin: descanso.finUtc })) {
            causas.push(causa('descanso', descanso.origen === 'semanal'
              ? 'horario' : 'franja_excepcion', descanso.bloqueId));
          }
        }
        const bloqueos = await this.bloqueos.consultar(contexto, cita.sucursalId,
          fechaLocal, fechaFinLocal, sede.zonaHoraria);
        for (const bloqueo of bloqueos) {
          if (empalma(cita.inicioUtc, cita.finUtc, bloqueo)) {
            causas.push(causa('bloqueo', 'bloqueo', bloqueo.id));
          }
        }
        // Una causa desaparecida no borra otras: la respuesta se recompone desde
        // esta instantánea y elimina solo duplicados exactos de código y referencia.
        const unicas = [...new Map(causas.map((fila) =>
          [`${fila.codigo}:${fila.referenciaTipo}:${fila.referenciaId}`, fila])).values()];
        if (unicas.length) citas.push({ citaId: cita.id,
          personalId: cita.personalId, sucursalId: cita.sucursalId,
          servicioId: cita.servicioId, inicioUtc: cita.inicioUtc,
          finUtc: cita.finUtc, zonaHoraria: cita.zonaHorariaReserva,
          causas: unicas });
      }
      return { desde: entrada.desde, hasta: entrada.hasta, citas };
    });
  }
}
