import type { EntityManager } from 'typeorm';
import { Cita } from '../disponibilidad/entities/cita.entity';
import { bloquearNegocioAgenda } from '../comun/bloqueos-coordinados';
import { CondicionConfirmacionCita } from './entities/condicion-confirmacion-cita.entity';
import type { EnvioWhatsapp } from './entities/envio-whatsapp.entity';

/** Los resultados que pueden cambiar la política toman negocio y cita antes del envío. */
export async function bloquearCitaDeEnvio(manager: EntityManager, negocioId: number, citaId: number) {
  await bloquearNegocioAgenda(manager, negocioId);
  return manager.getRepository(Cita).findOne({ where: { id: citaId, negocioId },
    lock: { mode: 'pessimistic_write' } });
}

/** Deriva solo la condición vigente de una cita aún pendiente. El plazo se conserva como histórico. */
export async function derivarSeguimientoWhatsapp(manager: EntityManager, envio: EnvioWhatsapp,
  cita: Cita | null, motivoSeguimiento: string): Promise<void> {
  if (envio.tipo !== 'inicial_pendiente' || cita?.estado !== 'pendiente' || !cita.condicionVigenteId
    || cita.generacionAutomatizacion !== envio.generacion) return;
  await manager.update(CondicionConfirmacionCita, {
    id: cita.condicionVigenteId, negocioId: envio.negocioId, citaId: envio.citaId,
    generacion: envio.generacion, estadoPolitica: 'pendiente',
  }, { estadoPolitica: 'seguimiento_manual', motivoSeguimiento });
}
