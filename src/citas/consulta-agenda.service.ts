import { Injectable, NotFoundException } from '@nestjs/common';
import { Brackets, In } from 'typeorm';
import { CondicionConfirmacionCita } from '../automatizaciones/entities/condicion-confirmacion-cita.entity';
import { EnvioWhatsapp } from '../automatizaciones/entities/envio-whatsapp.entity';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { Permiso } from '../auth/services/autorizacion.service';
import { Cita } from '../disponibilidad/entities/cita.entity';
import { Sucursal } from '../sucursales/entities/sucursal.entity';
import { Personal } from '../profesionales/entities/personal.entity';
import { CitasAfectadasService } from '../disponibilidad/citas-afectadas.service';
import { AccesoOperativoService, type ContextoOperativo } from './acceso-operativo.service';
import { EventoCita } from './entities/evento-cita.entity';
import { validarDetalleCita, validarIdCita, validarPaginacionHistorial } from './consulta-cita.entrada';
import { validarConsultaAgenda } from './consulta-agenda.entrada';
import { intervalosCivilesUtc, proyectarHorarioCita } from './horario-agenda';
import { ConsultaAgendaDemasiadoAmpliaException, MAX_CITAS_AGENDA } from './limites-agenda';

// Proyección explícita: conserva los nulos históricos y excluye referencias de sesión/apartado.
const CAMPOS = ['id', 'version', 'negocioId', 'sucursalId', 'personalId', 'servicioId',
  'clienteId', 'inicioUtc', 'finUtc', 'zonaHorariaReserva', 'estado', 'origen', 'folio',
  'nombreContacto', 'telefonoContacto', 'motivoConsulta', 'nombreNegocio', 'nombreSucursal',
  'nombreServicio', 'nombreProfesional', 'costoAceptado', 'separacionMinutos', 'finOcupacionUtc'] as const satisfies readonly (keyof Cita)[];

// El calendario recibe solo lo necesario para dibujar tarjetas; contacto completo/notas/precio se leen al abrir detalle.
const CAMPOS_RESUMEN = ['id', 'version', 'negocioId', 'sucursalId', 'personalId', 'servicioId',
  'inicioUtc', 'finUtc', 'zonaHorariaReserva', 'estado', 'origen', 'folio', 'nombreContacto',
  'nombreSucursal', 'nombreServicio', 'nombreProfesional'] as const satisfies readonly (keyof Cita)[];

// Solo se publica el contrato operativo: una fila JSON antigua no puede introducir contacto o secretos.
// Estado y versión anteriores/nuevos conservan la trazabilidad de las correcciones autorizadas.
const CAMPOS_EVENTO = new Set(['estado', 'version', 'origen', 'folio', 'clienteId', 'sucursalId', 'servicioId',
  'personalId', 'inicioUtc', 'finUtc', 'separacionMinutos', 'finOcupacionUtc', 'zonaHoraria', 'costoAceptado', 'causaCancelacion']);
function valoresOperativos(valores: Record<string, unknown> | null) {
  if (valores === null) return null;
  return Object.fromEntries(Object.entries(valores).filter(([clave, valor]) => CAMPOS_EVENTO.has(clave) &&
    (valor === null || typeof valor === 'string' || typeof valor === 'number' || typeof valor === 'boolean')));
}

function estadoSeguimiento(cita: Cita, condicion: CondicionConfirmacionCita, ahora: Date) {
  // El plazo depende del reloj y la política. Los acuses solo describen la comunicación.
  if (condicion.estadoPolitica !== 'pendiente') return condicion.estadoPolitica;
  if (cita.estado !== 'pendiente' || !condicion.vencimientoUtc) return 'sin_plazo';
  return ahora < condicion.vencimientoUtc ? 'plazo_activo' : 'plazo_vencido';
}

/** Lecturas operativas con snapshot, causas e historial; nunca modifican citas. */
@Injectable()
export class ConsultaAgendaService {
  constructor(private readonly acceso: AccesoOperativoService,
    private readonly afectadas: CitasAfectadasService) {}

  async listar(identidad: Pick<JwtPayload, 'sub' | 'sesionId'>, entrada: unknown) {
    const filtro = validarConsultaAgenda(entrada);
    // Todo el periodo y sus causas comparten la misma fotografía; no se encadenan páginas entre solicitudes.
    return this.acceso.ejecutar(identidad, Permiso.CONSULTAR_CITAS, async (ctx) => {
      const alcance = this.acceso.alcanceCitas(ctx);
      if (filtro.personalId !== undefined && ((ctx.personalId !== null && filtro.personalId !== ctx.personalId) ||
        !await ctx.manager.getRepository(Personal).existsBy({ negocioId: ctx.negocioId, id: filtro.personalId }))) throw new NotFoundException();
      if (filtro.sucursalId !== undefined && !await ctx.manager.getRepository(Sucursal)
        .existsBy({ negocioId: ctx.negocioId, id: filtro.sucursalId })) throw new NotFoundException();
      const consulta = ctx.manager.getRepository(Cita).createQueryBuilder('cita').where(alcance);
      if (filtro.sucursalId !== undefined) consulta.andWhere('cita.sucursalId = :sucursalId', { sucursalId: filtro.sucursalId });
      if (filtro.personalId !== undefined) consulta.andWhere('cita.personalId = :personalId', { personalId: filtro.personalId });
      if (filtro.estado !== undefined) consulta.andWhere('cita.estado = :estado', { estado: filtro.estado });
      if (filtro.busqueda) {
        // ESCAPE explícito hace literales %, _ y !; el texto siempre viaja parametrizado.
        const patron = `%${filtro.busqueda.replace(/[!%_]/g, '!$&')}%`;
        consulta.andWhere("cita.nombreContacto LIKE :patron ESCAPE '!'", { patron });
      }
      const siguiente = new Date(Date.parse(`${filtro.hasta}T00:00:00Z`) + 86400000).toISOString().split('T')[0];
      const inicioCivil = Date.parse(`${filtro.desde}T00:00:00Z`);
      const finCivil = Date.parse(`${siguiente}T00:00:00Z`);
      // Ventana UTC conservadora e indexable; la selección final usa cada zona histórica.
      consulta.andWhere('cita.inicioUtc >= :minimo AND cita.inicioUtc < :maximo', {
        minimo: new Date(inicioCivil - 2 * 86400000), maximo: new Date(finCivil + 2 * 86400000) });
      const zonas = await consulta.clone().select('cita.zonaHorariaReserva', 'zona').distinct(true).getRawMany<{ zona: string }>();
      if (!zonas.length) return { desde: filtro.desde, hasta: filtro.hasta, citas: [] };
      consulta.andWhere(new Brackets((q) => {
        // Una fecha omitida puede no producir intervalos: jamás dejar la condición vacía abierta.
        q.where('1 = 0');
        zonas.forEach(({ zona }, i) => intervalosCivilesUtc(filtro.desde, siguiente, zona).forEach((tramo, j) => {
          const clave = `${i}_${j}`;
          q.orWhere(`(cita.zonaHorariaReserva = :zona${clave} AND cita.inicioUtc >= :desde${clave} AND cita.inicioUtc < :hasta${clave})`, {
            [`zona${clave}`]: zona, [`desde${clave}`]: tramo.inicio, [`hasta${clave}`]: tramo.fin });
        }));
      }));
      const filas = await consulta.select([...CAMPOS_RESUMEN, 'finOcupacionUtc', 'condicionVigenteId'].map((campo) => `cita.${campo}`))
        .orderBy('cita.inicioUtc', 'ASC').addOrderBy('cita.id', 'ASC')
        .limit(MAX_CITAS_AGENDA + 1).getMany();
      // La fila centinela detecta exceso tras alcance/fechas/filtros. Nunca truncar ni calcular causas antes del control.
      if (filas.length > MAX_CITAS_AGENDA) throw new ConsultaAgendaDemasiadoAmpliaException();
      // Una sola lectura de políticas para todo el periodo autorizado, sin cargar envíos ni razones en el calendario.
      const ids = filas.flatMap((cita) => cita.condicionVigenteId ? [cita.condicionVigenteId] : []);
      const condiciones = ids.length ? await ctx.manager.find(CondicionConfirmacionCita, {
        where: { negocioId: ctx.negocioId, id: In(ids) }, select: { id: true, estadoPolitica: true, vencimientoUtc: true },
      }) : [];
      const politicaPorId = new Map(condiciones.map((condicion) => [condicion.id, condicion]));
      const citas = [];
      // Un fallo en cualquier cita aborta el periodo entero; solo una respuesta completa puede ser 200.
      for (const cita of filas) {
        const causas = await this.afectadas.causasParaCita({ ...ctx, personalId: cita.personalId }, cita);
        const resumen = Object.fromEntries(CAMPOS_RESUMEN.map((campo) => [campo, cita[campo]])) as Pick<Cita, typeof CAMPOS_RESUMEN[number]>;
        const politica = cita.condicionVigenteId ? politicaPorId.get(cita.condicionVigenteId) : undefined;
        citas.push({ ...resumen, ...proyectarHorarioCita(cita), causas,
          ...(politica ? { seguimientoEstado: estadoSeguimiento(cita, politica, ctx.ahora) } : {}) });
      }
      return { desde: filtro.desde, hasta: filtro.hasta, citas };
    }, 'REPEATABLE READ');
  }

  async detalle(identidad: Pick<JwtPayload, 'sub' | 'sesionId'>, idEntrada: unknown, query: unknown) {
    const id = validarIdCita(idEntrada);
    validarDetalleCita(query);
    return this.acceso.ejecutar(identidad, Permiso.CONSULTAR_CITAS, async (ctx) => {
      const cita = await ctx.manager.getRepository(Cita).createQueryBuilder('cita')
        .select([...CAMPOS, 'condicionVigenteId', 'generacionAutomatizacion'].map((campo) => `cita.${campo}`))
        .where({ ...this.acceso.alcanceCitas(ctx), id }).getOne();
      if (!cita) throw new NotFoundException();
      return this.proyectarCita(ctx, cita);
    }, 'REPEATABLE READ');
  }

  async historial(identidad: Pick<JwtPayload, 'sub' | 'sesionId'>, idEntrada: unknown, query: unknown) {
    const id = validarIdCita(idEntrada);
    const pagina = validarPaginacionHistorial(query);
    return this.acceso.ejecutar(identidad, Permiso.CONSULTAR_CITAS, async (ctx) => {
      // Comprobar la cita antes de leer eventos impide inferir historiales de IDs ajenos.
      const cita = await ctx.manager.getRepository(Cita).createQueryBuilder('cita').select('cita.id')
        .where({ ...this.acceso.alcanceCitas(ctx), id }).getOne();
      if (!cita) throw new NotFoundException();
      const filas = await ctx.manager.getRepository(EventoCita).createQueryBuilder('evento')
        .select(['evento.id', 'evento.actorUsuarioId', 'evento.actorTipo', 'evento.accion', 'evento.ocurridoEn',
          'evento.versionResultante', 'evento.valoresAntes', 'evento.valoresDespues', 'evento.motivo'])
        .where({ negocioId: ctx.negocioId, citaId: id })
        .orderBy('evento.ocurridoEn', 'ASC').addOrderBy('evento.versionResultante', 'ASC').addOrderBy('evento.id', 'ASC')
        .offset((pagina.pagina - 1) * pagina.limite).limit(pagina.limite + 1).getMany();
      return { eventos: filas.slice(0, pagina.limite).map((evento) => ({ id: evento.id,
        // Los procesos y las confirmaciones externas se identifican sin publicar referencias privadas.
        actorUsuarioId: evento.actorUsuarioId, origenActor: evento.actorTipo === 'cliente_whatsapp' || evento.actorTipo === 'sistema'
          ? evento.actorTipo : evento.actorUsuarioId === null ? 'portal_publico' : 'personal',
        accion: evento.accion, ocurridoEn: evento.ocurridoEn, versionResultante: evento.versionResultante,
        valoresAntes: valoresOperativos(evento.valoresAntes), valoresDespues: valoresOperativos(evento.valoresDespues),
        // La ausencia de motivo no se rellena con notas de atención ni con texto inventado.
        ...(evento.motivo === null ? {} : { motivo: evento.motivo }) })),
        ...pagina, hayMas: filas.length > pagina.limite };
    }, 'REPEATABLE READ');
  }

  private async proyectarCita(ctx: ContextoOperativo, cita: Cita) {
    const causas = await this.afectadas.causasParaCita({ ...ctx, personalId: cita.personalId }, cita);
    // TypeORM puede inicializar propiedades no seleccionadas con undefined: no propagar la entidad.
    const snapshot = Object.fromEntries(CAMPOS.map((campo) => [campo, cita[campo]])) as Pick<Cita, typeof CAMPOS[number]>;
    const condicion = cita.condicionVigenteId && cita.generacionAutomatizacion
      ? await ctx.manager.findOneBy(CondicionConfirmacionCita, { negocioId: ctx.negocioId, citaId: cita.id,
        id: cita.condicionVigenteId, generacion: cita.generacionAutomatizacion }) : null;
    if (!condicion) return { ...snapshot, ...proyectarHorarioCita(cita), causas };
    // El detalle publica estados de la generación actual, sin destinatario, secretos ni respuesta del proveedor.
    const envios = await ctx.manager.find(EnvioWhatsapp, { where: { negocioId: ctx.negocioId, citaId: cita.id,
      generacion: condicion.generacion }, select: { tipo: true, estado: true }, order: { id: 'ASC' } });
    return { ...snapshot, ...proyectarHorarioCita(cita), causas, seguimiento: {
      estado: estadoSeguimiento(cita, condicion, ctx.ahora), vencimientoUtc: condicion.vencimientoUtc,
      motivoSeguimiento: condicion.estadoPolitica === 'seguimiento_manual' ? condicion.motivoSeguimiento : null,
      envios: envios.map(({ tipo, estado }) => ({ tipo, estado })),
    } };
  }
}
