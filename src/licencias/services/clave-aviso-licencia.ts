import { TipoEnvioCorreo } from '../../correos/entities/envio-correo.entity';

export interface IdentidadAvisoLicencia {
  negocioId: number;
  licenciaId: number;
  tipo: TipoEnvioCorreo;
  versionVencimiento?: number;
  umbralDias?: 7 | 15;
  versionSuspension?: number;
  operacionLicenciaId?: string;
}

/** Separa el vencimiento, el ciclo de suspensión y cada operación confirmada. */
export function claveAvisoLicencia(datos: IdentidadAvisoLicencia): string {
  const base = `negocio:${datos.negocioId}:licencia:${datos.licenciaId}`;
  if (datos.operacionLicenciaId !== undefined) {
    return `${base}:operacion:${datos.operacionLicenciaId}:tipo:${datos.tipo}`;
  }
  if (datos.versionSuspension !== undefined) {
    return `${base}:suspension:${datos.versionSuspension}:tipo:${datos.tipo}`;
  }
  return `${base}:vencimiento:${datos.versionVencimiento}:tipo:${datos.tipo}`
    + (datos.umbralDias === undefined ? '' : `:umbral:${datos.umbralDias}`);
}
