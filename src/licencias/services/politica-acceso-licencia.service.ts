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
    if (licencia.congeladaEn != null || licencia.suspendidaEn !== null) return EstadoAccesoLicencia.SUSPENDIDA;
    if (licencia.habilitadaEn === null || licencia.venceEn === null) {
      return EstadoAccesoLicencia.PENDIENTE;//retorna pendiente si la licencia no esta habilitada o no tiene fecha de vencimiento
    }
    if (ahora.getTime() >= licencia.venceEn.getTime()) return EstadoAccesoLicencia.VENCIDA;
    // En la gracia se permite el uso hasta el menor del vencimiento y el bloqueo previsto.
    if (licencia.bloqueoProgramadoEn != null
      && ahora.getTime() >= licencia.bloqueoProgramadoEn.getTime()) {
      return EstadoAccesoLicencia.SUSPENDIDA;
    }
    return EstadoAccesoLicencia.VIGENTE;
  }

  evaluarAccesoUsuario(contexto: ContextoAccesoUsuario): ResultadoAcceso {
    const estadoLicencia = this.estado(contexto.licencia, contexto.ahora);
    if (!contexto.cuentaActiva) {//verifica si la cuenta del usuario esta activa
      return { permitido: false, estadoLicencia, motivo: 'cuenta_inactiva' };
    }
    if (!contexto.cuentaActivada) {//verifica si la cuenta del usuario esta activada
      return { permitido: false, estadoLicencia, motivo: 'cuenta_pendiente' };
    }
    if (!contexto.negocioActivado) {//verifica si el negocio del usuario esta activado
      return { permitido: false, estadoLicencia, motivo: 'negocio_pendiente' };
    }
    if (estadoLicencia !== EstadoAccesoLicencia.VIGENTE) {//verifica si la licencia del usuario esta vigente
      return { permitido: false, estadoLicencia, motivo: `licencia_${estadoLicencia}` };
    }
    return { permitido: true, estadoLicencia, motivo: null };
  }

  puedeActivarAdministrador(licencia: Licencia, ahora: Date): boolean {
    return this.estado(licencia, ahora) === EstadoAccesoLicencia.PENDIENTE
      && licencia.suspensionSolicitadaEn == null;
  }

  puedeAceptarReserva(
    negocioActivado: boolean,
    licencia: Licencia,
    ahora: Date,
  ): boolean {
    return negocioActivado && this.estado(licencia, ahora) === EstadoAccesoLicencia.VIGENTE;
  }
}
