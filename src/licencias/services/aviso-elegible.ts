import { Licencia } from '../entities/licencia.entity';

const VENTANA_AVISO_MS = 48 * 60 * 60 * 1000;
const DIA_MS = 24 * 60 * 60 * 1000;

/** Selecciona el único umbral aplicable al tiempo restante real. */
export function umbralPreventivo(licencia: Licencia, ahora: Date): 15 | 7 | null {
  const vence = licencia.venceEn?.getTime();
  const tiempo = ahora.getTime();
  if (!Number.isFinite(tiempo) || licencia.habilitadaEn === null ||
    vence === undefined || !Number.isFinite(vence) ||
    licencia.versionVencimiento < 1 || licencia.suspendidaEn !== null ||
    licencia.congeladaEn !== null ||
    (licencia.bloqueoProgramadoEn !== null && tiempo >= licencia.bloqueoProgramadoEn.getTime())) {
    return null;
  }
  const restante = vence - tiempo;
  if (restante <= 0 || restante > 15 * DIA_MS) return null;
  return restante <= 7 * DIA_MS ? 7 : 15;
}

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
