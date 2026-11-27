import { IsNull, type EntityManager } from 'typeorm';
import type { Cita } from '../disponibilidad/entities/cita.entity';
import { EnvioWhatsapp, type TipoEnvioWhatsapp } from './entities/envio-whatsapp.entity';
import { calcularRecordatorio } from './politica-temporal';
import { resumenWhatsapp } from './plantillas-whatsapp';
import { CanalWhatsapp } from './entities/canal-whatsapp.entity';
import type { CondicionConfirmacionCita } from './entities/condicion-confirmacion-cita.entity';
import { ConfiguracionAutomatizaciones } from './entities/configuracion-automatizaciones.entity';

const TOLERANCIA_RECORDATORIO_MS = 5 * 60_000;

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
  // La exclusión se decide a partir del milisegundo posterior a los cinco minutos.
  if (await manager.existsBy(EnvioWhatsapp, { negocioId: cita.negocioId, citaId: cita.id, generacion, tipo: 'recordatorio' })) return;
  const utilHasta = new Date(Math.min(cita.inicioUtc.getTime(), programado.getTime() + TOLERANCIA_RECORDATORIO_MS + 1));
  await guardarEnvioCita(manager, cita, generacion, 'recordatorio', programado, utilHasta);
}

/** El escritor de confirmación ya tiene la barrera de negocio y cita que protege la programación. */
export async function programarAlConfirmar(manager: EntityManager, cita: Cita,
  condicion: CondicionConfirmacionCita, ahora: Date): Promise<void> {
  if (condicion.categoria !== 'normal' || condicion.contactoAutorizado !== 1 || !/^\d{10}$/.test(cita.telefonoContacto ?? '')) return;
  const canal = await manager.findOneBy(CanalWhatsapp, { negocioId: cita.negocioId });
  if (canal?.habilitado !== 1) return;
  const configuracion = await manager.findOneBy(ConfiguracionAutomatizaciones, { negocioId: cita.negocioId });
  await programarRecordatorioCita(manager, cita, condicion.generacion, ahora, configuracion?.recordatorioHoras ?? 24, false);
}

/** Conserva la utilidad histórica, incluida la fila anterior que usaba justo cinco minutos como extremo. */
export function envioVigenteHasta(envio: EnvioWhatsapp, cita: Cita, instante: number): boolean {
  if (instante >= cita.inicioUtc.getTime()) return false;
  if (envio.tipo !== 'recordatorio') return instante < envio.utilHasta.getTime();
  const limite = envio.programadoEn.getTime() + TOLERANCIA_RECORDATORIO_MS;
  const utilHasta = envio.utilHasta.getTime() === limite ? limite + 1 : envio.utilHasta.getTime();
  return instante <= limite && instante < utilHasta;
}

export async function descartarEnviosSinTransporte(manager: EntityManager,
  alcance: Pick<EnvioWhatsapp, 'negocioId' | 'citaId' | 'generacion'> & { tipo?: TipoEnvioWhatsapp }, motivo: string): Promise<void> {
  // Un intento que ya llamó al proveedor conserva su toma para registrar el resultado o conciliarlo.
  await manager.getRepository(EnvioWhatsapp).createQueryBuilder().update().set({ estado: 'descartado',
    arrendamientoId: null, arrendadoHasta: null, ultimoError: motivo })
    .where([{ ...alcance, estado: 'pendiente' }, { ...alcance, estado: 'en_proceso', inicioTransporteEn: IsNull() }]).execute();
}
