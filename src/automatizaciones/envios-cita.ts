import type { EntityManager } from 'typeorm';
import type { Cita } from '../disponibilidad/entities/cita.entity';
import { EnvioWhatsapp, type TipoEnvioWhatsapp } from './entities/envio-whatsapp.entity';
import { calcularRecordatorio } from './politica-temporal';
import { resumenWhatsapp } from './plantillas-whatsapp';

/** Altas y movimientos usan el mismo snapshot mínimo y la misma clave por generación. */
export async function guardarEnvioCita(manager: EntityManager, cita: Cita, generacion: number,
  tipo: TipoEnvioWhatsapp, programadoEn: Date, utilHasta: Date): Promise<void> {
  if (utilHasta <= programadoEn) return;
  await manager.save(EnvioWhatsapp, { negocioId: cita.negocioId, citaId: cita.id, generacion, tipo,
    claveEfecto: `cita:${cita.negocioId}:${cita.id}:${generacion}:${tipo}`,
    destinoE164: `+52${cita.telefonoContacto}`, parametrosPlantilla: resumenWhatsapp(cita), programadoEn, utilHasta,
    estado: 'pendiente', intentos: 0, proximoIntentoEn: programadoEn });
}

export async function programarRecordatorioCita(manager: EntityManager, cita: Cita, generacion: number,
  ahora: Date, anticipacionHoras: number, proxima: boolean): Promise<void> {
  const programado = calcularRecordatorio(ahora, cita.inicioUtc, anticipacionHoras, proxima);
  if (!programado) return;
  const utilHasta = new Date(Math.min(cita.inicioUtc.getTime(), programado.getTime() + 5 * 60_000));
  await guardarEnvioCita(manager, cita, generacion, 'recordatorio', programado, utilHasta);
}
