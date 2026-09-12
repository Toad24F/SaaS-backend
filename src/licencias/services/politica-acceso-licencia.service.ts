import { Injectable } from '@nestjs/common';
import { Licencia } from '../entities/licencia.entity';

export enum EstadoAccesoLicencia {
  PENDIENTE = 'pendiente',
  VIGENTE = 'vigente',
  VENCIDA = 'vencida',
  SUSPENDIDA = 'suspendida',
}

export interface ContextoAccesoUsuario {
  cuentaActiva: boolean;
  cuentaActivada: boolean;
  negocioActivado: boolean;
  licencia: Licencia;
  ahora: Date;
}

export interface ResultadoAcceso {
  permitido: boolean;
  estadoLicencia: EstadoAccesoLicencia;
  motivo: string | null;
}

/** Política pura: evalúa acceso sin consumir ni desplazar fechas de licencia. */
@Injectable()
export class PoliticaAccesoLicenciaService {
  estado(licencia: Licencia, ahora: Date): EstadoAccesoLicencia {
    if (licencia.suspendidaEn !== null) return EstadoAccesoLicencia.SUSPENDIDA;
    if (licencia.habilitadaEn === null || licencia.venceEn === null) {
      return EstadoAccesoLicencia.PENDIENTE;
    }
    return ahora.getTime() >= licencia.venceEn.getTime()
      ? EstadoAccesoLicencia.VENCIDA
      : EstadoAccesoLicencia.VIGENTE;
  }

  evaluarAccesoUsuario(contexto: ContextoAccesoUsuario): ResultadoAcceso {
    const estadoLicencia = this.estado(contexto.licencia, contexto.ahora);
    if (!contexto.cuentaActiva) {
      return { permitido: false, estadoLicencia, motivo: 'cuenta_inactiva' };
    }
    if (!contexto.cuentaActivada) {
      return { permitido: false, estadoLicencia, motivo: 'cuenta_pendiente' };
    }
    if (!contexto.negocioActivado) {
      return { permitido: false, estadoLicencia, motivo: 'negocio_pendiente' };
    }
    if (estadoLicencia !== EstadoAccesoLicencia.VIGENTE) {
      return { permitido: false, estadoLicencia, motivo: `licencia_${estadoLicencia}` };
    }
    return { permitido: true, estadoLicencia, motivo: null };
  }

  puedeActivarAdministrador(licencia: Licencia, ahora: Date): boolean {
    return this.estado(licencia, ahora) === EstadoAccesoLicencia.PENDIENTE;
  }

  puedeActivarRecepcionista(licencia: Licencia, ahora: Date): boolean {
    return this.estado(licencia, ahora) === EstadoAccesoLicencia.VIGENTE;
  }

  puedeAceptarReserva(
    negocioActivado: boolean,
    licencia: Licencia,
    ahora: Date,
  ): boolean {
    return negocioActivado && this.estado(licencia, ahora) === EstadoAccesoLicencia.VIGENTE;
  }
}
