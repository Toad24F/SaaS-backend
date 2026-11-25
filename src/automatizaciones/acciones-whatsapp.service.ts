import { Inject, Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { IsNull, type EntityManager } from 'typeorm';
import { EventoCita } from '../citas/entities/evento-cita.entity';
import { bloquearNegocioAgenda, bloquearRecursosAgenda } from '../comun/bloqueos-coordinados';
import { RELOJ, type Reloj } from '../comun/reloj';
import { Cita } from '../disponibilidad/entities/cita.entity';
import { AccionConfirmacion } from './entities/accion-confirmacion.entity';
import { CanalWhatsapp } from './entities/canal-whatsapp.entity';
import { CondicionConfirmacionCita } from './entities/condicion-confirmacion-cita.entity';
import { EnvioWhatsapp } from './entities/envio-whatsapp.entity';
import type { EventoWhatsapp } from './entities/evento-whatsapp.entity';
import { hashWhatsapp, huellaRemitenteWhatsapp } from './recibos-whatsapp';
import { programarAlConfirmar } from './envios-cita';

export const CLAVE_ACCIONES_WHATSAPP = Symbol('CLAVE_ACCIONES_WHATSAPP');
type ResultadoAccion = 'aplicada' | 'no_aplicable' | 'esperando_envio';

/** Genera el botón y aplica el recibo autenticado bajo las barreras de agenda. */
@Injectable()
export class AccionesWhatsappService {
  constructor(@Inject(CLAVE_ACCIONES_WHATSAPP) private readonly clave: string,
    @Inject(RELOJ) private readonly reloj: Reloj) {}

  get habilitada(): boolean {
    return Buffer.byteLength(this.clave.trim(), 'utf8') >= 32;
  }

  async preparar(manager: EntityManager, envio: EnvioWhatsapp, cita: Cita,
    condicion: CondicionConfirmacionCita, canal: CanalWhatsapp, ahora: Date): Promise<string | null> {
    const expiraEn = limiteAccion(cita, condicion);
    if (!this.habilitada || ahora >= expiraEn) return null;
    const payload = this.payload(envio, cita, condicion, canal, expiraEn);
    const tokenHash = hashWhatsapp(payload);
    const anterior = await manager.findOneBy(AccionConfirmacion, { negocioId: envio.negocioId, envioId: envio.id });
    // Una toma repetida recupera el mismo botón. Una acción anterior de otro contexto no se reemplaza.
    if (anterior) return !anterior.consumidoEn && iguales(anterior.tokenHash, tokenHash) ? payload : null;
    await manager.insert(AccionConfirmacion, { negocioId: envio.negocioId, citaId: envio.citaId,
      generacion: envio.generacion, envioId: envio.id, tipoEnvio: 'inicial_pendiente',
      tokenHash, expiraEn, creadoEn: ahora, consumidoEn: null });
    return payload;
  }

  async aplicar(manager: EntityManager, evento: EventoWhatsapp, secretoApp: string): Promise<ResultadoAccion> {
    const { negocioId, accionHash, eventoExternoId, mensajeExternoId, remitenteHash } = evento;
    if (!accionHash || !eventoExternoId || !mensajeExternoId || !remitenteHash) return 'no_aplicable';
    const referencia = await manager.findOneBy(AccionConfirmacion, { negocioId, tokenHash: accionHash });
    if (!referencia || referencia.consumidoEn) return 'no_aplicable';
    if (!this.habilitada) throw new Error('La clave de confirmación de WhatsApp no está disponible.');

    // El recibo ya está bloqueado. La barrera del Profesional precede a la cita, igual que en los escritores privados.
    await bloquearNegocioAgenda(manager, negocioId);
    const canal = await manager.findOne(CanalWhatsapp, { where: { negocioId }, lock: { mode: 'pessimistic_write' } });
    const preliminar = await manager.findOneBy(Cita, { id: referencia.citaId, negocioId });
    if (!canal || !preliminar) return 'no_aplicable';
    await bloquearRecursosAgenda(manager, negocioId, 'personal', [preliminar.personalId]);
    const cita = await manager.findOne(Cita, { where: { id: referencia.citaId, negocioId }, lock: { mode: 'pessimistic_write' } });
    if (cita?.estado !== 'pendiente' || cita.version >= 4_294_967_295 || !cita.condicionVigenteId
      || cita.generacionAutomatizacion !== referencia.generacion) return 'no_aplicable';

    const envio = await manager.findOne(EnvioWhatsapp, { where: { id: referencia.envioId, negocioId,
      citaId: cita.id, generacion: referencia.generacion, tipo: 'inicial_pendiente' }, lock: { mode: 'pessimistic_write' } });
    const accion = await manager.findOne(AccionConfirmacion, { where: { id: referencia.id, negocioId }, lock: { mode: 'pessimistic_write' } });
    const condicion = await manager.findOne(CondicionConfirmacionCita, { where: { id: cita.condicionVigenteId,
      negocioId, citaId: cita.id, generacion: referencia.generacion }, lock: { mode: 'pessimistic_write' } });
    // El proveedor y el ingreso HTTP pueden tener horas anteriores. La vigencia se decide después de esperar SQL.
    const ahora = this.reloj.ahora();
    if (!envio || !accion || accion.consumidoEn || ahora < accion.creadoEn || ahora >= accion.expiraEn || !condicion
      || condicion.contactoAutorizado !== 1 || condicion.confirmadoEn
      || (condicion.estadoPolitica !== 'pendiente' && condicion.estadoPolitica !== 'seguimiento_manual')
      || ahora >= limiteAccion(cita, condicion)) return 'no_aplicable';

    if (!this.correspondeAlContexto(accion, envio, cita, condicion, canal) || !iguales(accion.tokenHash, accionHash)
      || !coincideRemitente(secretoApp, canal.remitenteExternoId, envio.destinoE164, remitenteHash)) return 'no_aplicable';
    if (!envio.referenciaExterna && (envio.estado === 'incierto'
      || (envio.estado === 'en_proceso' && envio.inicioTransporteEn))) return 'esperando_envio';
    if (envio.referenciaExterna !== mensajeExternoId || envio.estado === 'pendiente' || envio.estado === 'descartado') {
      return 'no_aplicable';
    }

    const version = cita.version + 1;
    const consumo = await manager.update(AccionConfirmacion, { id: accion.id, negocioId, consumidoEn: IsNull() }, { consumidoEn: ahora });
    const cambio = await manager.update(Cita, { id: cita.id, negocioId, version: cita.version }, { estado: 'confirmada', version });
    if (consumo.affected !== 1 || cambio.affected !== 1) throw new Error('No se pudo aplicar la confirmación.');
    await manager.update(CondicionConfirmacionCita, { id: condicion.id, negocioId },
      { estadoPolitica: 'confirmada', confirmadoEn: ahora, origenConfirmacion: 'whatsapp' });
    // La programación se fija al confirmar y se revierte si falla el historial o el consumo.
    await programarAlConfirmar(manager, cita, condicion, ahora);
    // El actor de auditoría es el ID de la respuesta y los valores registran solo estado y versión.
    await manager.insert(EventoCita, { negocioId, citaId: cita.id, accion: 'cambio_estado', ocurridoEn: ahora,
      referenciaWhatsapp: eventoExternoId, actorUsuarioId: null, sesionPublicaId: null, procesoSistema: null,
      versionResultante: version, valoresAntes: { estado: cita.estado, version: cita.version },
      valoresDespues: { estado: 'confirmada', version }, motivo: null });
    return 'aplicada';
  }

  /** El botón ofrecido también debe seguir siendo verificable para que su entrega habilite una cancelación. */
  correspondeAlContexto(accion: AccionConfirmacion, envio: EnvioWhatsapp, cita: Cita,
    condicion: CondicionConfirmacionCita, canal: CanalWhatsapp): boolean {
    const limite = limiteAccion(cita, condicion);
    return this.habilitada && accion.expiraEn.getTime() === limite.getTime()
      && iguales(accion.tokenHash, hashWhatsapp(this.payload(envio, cita, condicion, canal, limite)));
  }

  private payload(envio: EnvioWhatsapp, cita: Cita, condicion: CondicionConfirmacionCita,
    canal: CanalWhatsapp, expiraEn: Date): string {
    // La firma es opaca y vincula contexto histórico, destinatario y versión sin exponerlos en el botón.
    const datos = JSON.stringify(['wa1', envio.negocioId, cita.id, envio.id, condicion.id, condicion.generacion,
      cita.version, cita.inicioUtc.toISOString(), expiraEn.toISOString(), canal.remitenteExternoId, envio.destinoE164]);
    return `wa1.${createHmac('sha256', this.clave).update(datos).digest('base64url')}`;
  }
}

function limiteAccion(cita: Cita, condicion: CondicionConfirmacionCita): Date {
  return condicion.vencimientoUtc && condicion.vencimientoUtc < cita.inicioUtc ? condicion.vencimientoUtc : cita.inicioUtc;
}

function coincideRemitente(secretoApp: string, canalId: string, destinoE164: string, huellaRecibida: string): boolean {
  const destino = destinoE164.slice(1);
  if (iguales(huellaRemitenteWhatsapp(secretoApp, canalId, destino), huellaRecibida)) return true;

  // Meta puede devolver 521 seguido de los diez dígitos del mismo destino mexicano.
  return /^52\d{10}$/.test(destino)
    && iguales(huellaRemitenteWhatsapp(secretoApp, canalId, `521${destino.slice(2)}`), huellaRecibida);
}

function iguales(a: string, b: string): boolean {
  return /^[0-9a-f]{64}$/.test(a) && /^[0-9a-f]{64}$/.test(b) && timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}
