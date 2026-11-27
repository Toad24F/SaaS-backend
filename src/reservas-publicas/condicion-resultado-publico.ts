import type { EntityManager } from 'typeorm';
import { CondicionConfirmacionCita } from '../automatizaciones/entities/condicion-confirmacion-cita.entity';

/** Proyecta solo la condición propia de la cita; nunca reconstruye plazos con la configuración actual. */
export async function condicionResultadoPublico(manager: EntityManager, negocioId: number,
  citaId: number): Promise<{ vencimientoConfirmacionUtc: string | null; seguimientoManual: boolean }> {
  const condicion = await manager.findOneBy(CondicionConfirmacionCita,
    { negocioId, citaId, generacion: 1 });
  const vencimiento = condicion?.estadoPolitica === 'pendiente' ? condicion.vencimientoUtc : null;
  return { vencimientoConfirmacionUtc: vencimiento?.toISOString() ?? null,
    seguimientoManual: vencimiento === null };
}
