import { Inject, Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { EventoCita } from '../citas/entities/evento-cita.entity';
import { bloquearNegocioAgenda, bloquearRecursosAgenda } from '../comun/bloqueos-coordinados';
import { RELOJ, type Reloj } from '../comun/reloj';
import { Cita } from '../disponibilidad/entities/cita.entity';
import { AccionesWhatsappService } from './acciones-whatsapp.service';
import { AccionConfirmacion } from './entities/accion-confirmacion.entity';
import { CanalWhatsapp } from './entities/canal-whatsapp.entity';
import { CondicionConfirmacionCita } from './entities/condicion-confirmacion-cita.entity';
import { EnvioWhatsapp } from './entities/envio-whatsapp.entity';
import { descartarEnviosSinTransporte } from './envios-cita';

const LIMITE_LOTE = 50;
const CAUSA = 'falta_confirmacion_plazo' as const;
const MOTIVO = 'Falta de confirmación dentro del plazo';
type Candidata = Pick<CondicionConfirmacionCita, 'id' | 'negocioId' | 'citaId' | 'generacion'>;
type Resultado = 'canceladas' | 'seguimiento' | null;

/** El trabajo y su exclusión viven en SQL. La selección solo descubre candidatos. */
@Injectable()
export class CancelacionAutomaticaCitasService {
  constructor(private readonly db: DataSource, @Inject(RELOJ) private readonly reloj: Reloj,
    private readonly acciones: AccionesWhatsappService) {}

  async ejecutarLote(limite = LIMITE_LOTE): Promise<{ canceladas: number; seguimiento: number }> {
    if (!Number.isInteger(limite) || limite < 1 || limite > LIMITE_LOTE) throw new RangeError('Límite de lote inválido.');
    const candidatas = await this.db.getRepository(CondicionConfirmacionCita).createQueryBuilder('p')
      .select(['p.id', 'p.negocioId', 'p.citaId', 'p.generacion'])
      .innerJoin(Cita, 'c', 'c.negocioId = p.negocioId AND c.id = p.citaId AND c.condicionVigenteId = p.id AND c.generacionAutomatizacion = p.generacion')
      .where("p.estadoPolitica = 'pendiente' AND c.estado = 'pendiente' AND p.vencimientoUtc <= :ahora", { ahora: this.reloj.ahora() })
      .orderBy('p.vencimientoUtc', 'ASC').addOrderBy('p.id', 'ASC').limit(limite).getMany();
    const resultados = { canceladas: 0, seguimiento: 0 };
    for (const candidata of candidatas) {
      const resultado = await this.db.transaction('READ COMMITTED', (manager) => this.resolver(manager, candidata));
      if (resultado) resultados[resultado] += 1;
    }
    return resultados;
  }

  private async resolver(manager: EntityManager, candidata: Candidata): Promise<Resultado> {
    const { negocioId, citaId, generacion } = candidata;
    const lock = { mode: 'pessimistic_write' } as const;
    await bloquearNegocioAgenda(manager, negocioId);
    const canal = await manager.findOne(CanalWhatsapp, { where: { negocioId }, lock });
    const referencia = await manager.findOneBy(Cita, { negocioId, id: citaId });
    if (!referencia) return null;
    await bloquearRecursosAgenda(manager, negocioId, 'personal', [referencia.personalId]);
    const cita = await manager.findOne(Cita, { where: { negocioId, id: citaId }, lock });
    if (cita?.estado !== 'pendiente' || cita.generacionAutomatizacion !== generacion || cita.condicionVigenteId !== candidata.id) return null;

    // Usa el mismo orden de bloqueo que el botón y la recepción de fallos de envío.
    const envio = await manager.findOne(EnvioWhatsapp, { where: { negocioId, citaId, generacion, tipo: 'inicial_pendiente' }, lock });
    const accion = envio ? await manager.findOne(AccionConfirmacion, { where: { negocioId, citaId, generacion, envioId: envio.id }, lock }) : null;
    const condicion = await manager.findOne(CondicionConfirmacionCita, { where: { id: candidata.id, negocioId, citaId, generacion }, lock });
    const ahora = this.reloj.ahora();
    const plazo = condicion?.vencimientoUtc;
    if (condicion?.estadoPolitica !== 'pendiente' || !plazo || ahora < plazo) return null;

    // Una entrega se acredita con el hito del servidor en el envío propio y la acción vigente en ese instante.
    const entregaValida = condicion.contactoAutorizado === 1 && canal && envio && accion
      && this.acciones.correspondeAlContexto(accion, envio, cita, condicion, canal) && huboEntregaUtil(cita, envio, accion, plazo);
    const motivoSeguimiento = cita.inicioUtc <= ahora ? 'La cita alcanzó su inicio antes de aplicar el plazo.'
      : !entregaValida ? 'Sin constancia de entrega del botón de WhatsApp antes del vencimiento.'
        : cita.version >= 4_294_967_295 ? 'La cita alcanzó su versión máxima.' : null;
    if (motivoSeguimiento) {
      await manager.update(CondicionConfirmacionCita, condicion.id, { estadoPolitica: 'seguimiento_manual', motivoSeguimiento });
      return 'seguimiento';
    }

    const version = cita.version + 1;
    await manager.update(Cita, { negocioId, id: citaId }, { estado: 'cancelada', causaCancelacion: CAUSA, version });
    await descartarEnviosSinTransporte(manager, { negocioId, citaId, generacion, tipo: 'recordatorio' }, 'cita_cancelada');
    await manager.update(CondicionConfirmacionCita, condicion.id, { estadoPolitica: 'cancelada' });
    // El cambio de estado libera la ocupación existente. La auditoría y la política comparten ese commit.
    await manager.insert(EventoCita, { negocioId, citaId, accion: 'cancelacion', procesoSistema: 'cancelacion_automatica',
      motivo: MOTIVO, ocurridoEn: ahora, versionResultante: version,
      valoresAntes: { estado: cita.estado, version: cita.version },
      valoresDespues: { estado: 'cancelada', version, causaCancelacion: CAUSA } });
    return 'canceladas';
  }
}

function huboEntregaUtil(cita: Cita, envio: EnvioWhatsapp, accion: AccionConfirmacion, plazo: Date): boolean {
  if (!envio.referenciaExterna || (envio.estado !== 'entregado' && envio.estado !== 'leido')
    || envio.parametrosPlantilla.inicioUtc !== cita.inicioUtc.toISOString()
    || accion.consumidoEn) return false;
  return [envio.entregadoEn, envio.leidoEn].some((hito) => hito && hito >= accion.creadoEn && hito < plazo);
}
