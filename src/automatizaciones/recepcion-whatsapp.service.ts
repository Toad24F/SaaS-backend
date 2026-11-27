import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { DataSource, In, QueryFailedError, type EntityManager } from 'typeorm';
import { RELOJ, type Reloj } from '../comun/reloj';
import { AccionesWhatsappService } from './acciones-whatsapp.service';
import { CanalWhatsapp } from './entities/canal-whatsapp.entity';
import { EnvioWhatsapp } from './entities/envio-whatsapp.entity';
import { EventoWhatsapp } from './entities/evento-whatsapp.entity';
import { AccionConfirmacion } from './entities/accion-confirmacion.entity';
import type { ReciboWhatsapp } from './recibos-whatsapp';
import { bloquearCitaDeEnvio, derivarSeguimientoWhatsapp } from './seguimiento-whatsapp';

@Injectable()
export class RecepcionWhatsappService {
  constructor(private readonly db: DataSource, @Inject(RELOJ) private readonly reloj: Reloj,
    private readonly acciones: AccionesWhatsappService) {}

  async recibir(recibos: ReciboWhatsapp[], secretoApp: string): Promise<void> {
    if (!recibos.length) return;
    const recibidoEn = this.reloj.ahora();
    try {
      const { estados, botones } = await this.db.transaction('READ COMMITTED', (manager) => this.persistir(manager, recibos, recibidoEn));
      // Los acuses pueden fijar el contexto de un botón importado en el mismo lote.
      let esperandoEnvio = false;
      for (const id of [...estados, ...botones]) {
        if (!await this.procesarEvento(id, secretoApp)) esperandoEnvio = true;
      }
      if (esperandoEnvio) throw new Error('Un botón sigue pendiente de correlación.');
    } catch {
      throw new ServiceUnavailableException('No se pudo completar la recepción de WhatsApp.');
    }
  }

  async procesarLote(secretoApp: string, limite: number): Promise<void> {
    // Se retoman recibos durables tras reiniciar. Un botón que aún espera ID no ocupa el lote.
    const filas = await this.db.getRepository(EventoWhatsapp).createQueryBuilder('r').select(['r.id'])
      .leftJoin(AccionConfirmacion, 'a', "r.tipo = 'respuesta' AND a.negocioId = r.negocioId AND a.tokenHash = r.accionHash")
      .leftJoin(EnvioWhatsapp, 'e', 'e.negocioId = a.negocioId AND e.id = a.envioId')
      .where("r.estadoProcesamiento = 'pendiente'")
      .andWhere(`(e.id IS NULL OR a.expiraEn <= :ahora OR e.referenciaExterna IS NOT NULL
        OR e.estado NOT IN ('incierto', 'en_proceso') OR (e.estado = 'en_proceso' AND e.inicioTransporteEn IS NULL))`,
      { ahora: this.reloj.ahora() })
      .orderBy("CASE WHEN r.tipo = 'respuesta' THEN 1 ELSE 0 END").addOrderBy('r.recibidoEn', 'ASC').addOrderBy('r.id', 'ASC')
      .limit(limite).getMany();
    for (const fila of filas) await this.procesarEvento(fila.id, secretoApp);
  }

  private async persistir(manager: EntityManager, recibos: ReciboWhatsapp[], recibidoEn: Date) {
    const remitentes = [...new Set(recibos.map((recibo) => recibo.remitenteExternoId))];
    const canales = await manager.findBy(CanalWhatsapp, { remitenteExternoId: In(remitentes) });
    const negocios = new Map(canales.map((canal) => [canal.remitenteExternoId, canal.negocioId]));
    const estados = new Set<string>();
    const botones = new Set<string>();
    // Orden estable para que lotes simultáneos adquieran las claves únicas en el mismo orden.
    const ordenados = [...recibos].sort((a, b) => a.remitenteExternoId.localeCompare(b.remitenteExternoId)
      || a.huellaEvento.localeCompare(b.huellaEvento));
    for (const { remitenteExternoId, ...datos } of ordenados) {
      const negocioId = negocios.get(remitenteExternoId);
      if (negocioId === undefined) continue;
      try {
        await manager.insert(EventoWhatsapp, { ...datos, negocioId, recibidoEn });
      } catch (error) {
        // Únicamente una colisión comprobada cuenta como deduplicación. Los demás fallos revierten el lote.
        if (!(error instanceof QueryFailedError) || error.driverError?.code !== 'ER_DUP_ENTRY') throw error;
      }
      const recibido = await manager.findOneByOrFail(EventoWhatsapp, { negocioId, huellaEvento: datos.huellaEvento });
      if (recibido.estadoProcesamiento === 'pendiente') {
        (recibido.tipo === 'respuesta' ? botones : estados).add(recibido.id);
      }
    }
    return { estados, botones };
  }

  private procesarEvento(id: string, secretoApp: string): Promise<boolean> {
    return this.db.transaction('READ COMMITTED', async (manager) => {
      const evento = await manager.getRepository(EventoWhatsapp).findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
      if (evento?.estadoProcesamiento !== 'pendiente') return true;
      let ultimoError: string | null;
      if (evento.tipo === 'respuesta') {
        const resultado = await this.acciones.aplicar(manager, evento, secretoApp);
        // El recibo queda recuperable cuando la respuesta de envío aún no tiene un ID de Meta.
        if (resultado === 'esperando_envio') return false;
        ultimoError = resultado === 'aplicada' ? null : 'accion_no_aplicable';
      } else {
        ultimoError = await this.aplicarEstado(manager, evento) ? null : 'envio_no_correlacionado';
      }
      await manager.update(EventoWhatsapp, id, { estadoProcesamiento: 'procesado', procesadoEn: this.reloj.ahora(),
        ultimoError });
      return true;
    });
  }

  private async aplicarEstado(manager: EntityManager, evento: EventoWhatsapp): Promise<boolean> {
    const { negocioId, correlacionProveedor, mensajeExternoId } = evento;
    if (!mensajeExternoId) return false;
    const referencia = await manager.findOneBy(EnvioWhatsapp, correlacionProveedor
      ? { negocioId, correlacionProveedor } : { negocioId, referenciaExterna: mensajeExternoId });
    if (!referencia) return false;
    const cita = evento.tipo === 'fallo' ? await bloquearCitaDeEnvio(manager, negocioId, referencia.citaId) : null;
    const envio = await manager.getRepository(EnvioWhatsapp).findOne({ where: { id: referencia.id, negocioId },
      lock: { mode: 'pessimistic_write' } });
    if (!envio || !corresponde(envio, evento)) return false;
    if (evento.tipo === 'fallo') {
      if (envio.estado === 'leido' || envio.estado === 'entregado') return true;
      await manager.update(EnvioWhatsapp, envio.id, { estado: 'fallido', referenciaExterna: mensajeExternoId,
        ultimoError: 'fallo_reportado_por_proveedor', arrendamientoId: null, arrendadoHasta: null, inicioTransporteEn: null });
      await derivarSeguimientoWhatsapp(manager, envio, cita, 'WhatsApp informó un fallo de entrega.');
      return true;
    }
    if (evento.tipo === 'enviado' && envio.estado === 'fallido') return true;

    // Los hitos guardan la primera recepción del servidor. La hora declarada por Meta queda en el recibo.
    const recibido = evento.recibidoEn;
    const esLectura = evento.tipo === 'leido';
    const esEntrega = evento.tipo === 'entregado';
    await manager.update(EnvioWhatsapp, envio.id, {
      estado: esLectura || envio.estado === 'leido' ? 'leido' : esEntrega || envio.estado === 'entregado' ? 'entregado' : 'aceptado',
      referenciaExterna: mensajeExternoId, aceptadoEn: primero(envio.aceptadoEn, recibido),
      entregadoEn: esEntrega ? primero(envio.entregadoEn, recibido) : envio.entregadoEn,
      leidoEn: esLectura ? primero(envio.leidoEn, recibido) : envio.leidoEn,
      ultimoError: null, arrendamientoId: null, arrendadoHasta: null, inicioTransporteEn: null,
    });
    return true;
  }
}

function corresponde(envio: EnvioWhatsapp, evento: EventoWhatsapp): boolean {
  // Tras esperar la fila, un rechazo conocido puede haber retirado el intento o un acuse fijado ya otro ID.
  if (evento.correlacionProveedor && evento.correlacionProveedor !== envio.correlacionProveedor) return false;
  if (envio.referenciaExterna ? envio.referenciaExterna !== evento.mensajeExternoId : !evento.correlacionProveedor) return false;
  if (envio.estado === 'en_proceso') return envio.inicioTransporteEn !== null;
  return envio.estado !== 'pendiente' && envio.estado !== 'descartado';
}

function primero(anterior: Date | null, recibido: Date): Date {
  return anterior && anterior < recibido ? anterior : recibido;
}
