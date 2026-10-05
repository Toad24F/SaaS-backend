import { Licencia } from '../entities/licencia.entity';

const VENTANA_AVISO_MS = 48 * 60 * 60 * 1000;

/** Solo un vencimiento habilitado y aún utilizable entra en la ventana de aviso. */
export function avisoElegible(licencia: Licencia, ahora: Date): boolean {
  const vence = licencia.venceEn?.getTime();
  const tiempo = ahora.getTime();
  return Number.isFinite(tiempo) && licencia.habilitadaEn !== null &&
    vence !== undefined && Number.isFinite(vence) &&
    licencia.versionVencimiento >= 1 && licencia.suspendidaEn === null &&
    licencia.congeladaEn === null &&
    (licencia.bloqueoProgramadoEn === null || tiempo < licencia.bloqueoProgramadoEn.getTime()) &&
    tiempo >= vence - VENTANA_AVISO_MS && tiempo < vence;
}
