import { Injectable } from '@nestjs/common';
import { Licencia } from '../entities/licencia.entity';
import { EstadoAccesoLicencia, PoliticaAccesoLicenciaService } from './politica-acceso-licencia.service';

export interface VistaVigenciaLicencia {
  estado: 'pendiente' | 'vigente' | 'suspension_pendiente' | 'suspendida' | 'vencida';
  condicionAcceso: boolean;
  suspensionPendiente: boolean;
  ahora: string;
  venceEn: string | null;
  bloqueoProgramadoEn: string | null;
  tiempoCongelado: boolean;
  tiempoRestante: { dias: number; horas: number; minutos: number } | null;
}

/** Construye una vista temporal estable a partir de una fecha explícita del reloj. */
@Injectable()
export class VistaVigenciaLicenciaService {
  private readonly politica = new PoliticaAccesoLicenciaService();

  crear(licencia: Licencia, ahora: Date): VistaVigenciaLicencia {
    const estadoBase = this.politica.estado(licencia, ahora);
    const pendiente = licencia.habilitadaEn == null || licencia.venceEn == null;
    // Al vencer el plazo, refleja la congelación aunque aún no haya corrido el materializador.
    const congelada = !pendiente && (licencia.congeladaEn != null || licencia.suspendidaEn != null
      || estadoBase === EstadoAccesoLicencia.SUSPENDIDA);
    const solicitudPendiente = licencia.suspensionSolicitadaEn != null && !congelada
      && estadoBase === EstadoAccesoLicencia.VIGENTE;
    const estado: VistaVigenciaLicencia['estado'] = pendiente ? 'pendiente'
      : congelada || estadoBase === EstadoAccesoLicencia.SUSPENDIDA ? 'suspendida'
        : estadoBase === EstadoAccesoLicencia.VENCIDA ? 'vencida'
          : solicitudPendiente ? 'suspension_pendiente' : 'vigente';
    const condicionAcceso = estadoBase === EstadoAccesoLicencia.VIGENTE;
    // Una suspensión efectiva usa su remanente fijo; nunca aparenta una cuenta atrás vencida.
    const instanteCongelacion = licencia.congeladaEn ?? licencia.suspendidaEn
      ?? licencia.bloqueoProgramadoEn;
    const restanteMs = congelada
      ? Math.max(0, licencia.remanenteMs == null
        ? licencia.venceEn!.getTime() - (instanteCongelacion?.getTime() ?? ahora.getTime())
        : Number(licencia.remanenteMs))
      : pendiente ? null : Math.max(0, Math.min(
        licencia.venceEn!.getTime(),
        licencia.bloqueoProgramadoEn?.getTime() ?? Number.POSITIVE_INFINITY,
      ) - ahora.getTime());
    const tiempoRestante = restanteMs === null ? null : {
      dias: Math.floor(restanteMs / 86_400_000),
      horas: Math.floor((restanteMs % 86_400_000) / 3_600_000),
      minutos: Math.floor((restanteMs % 3_600_000) / 60_000),
    };

    return {
      estado, condicionAcceso, ahora: ahora.toISOString(),
      suspensionPendiente: licencia.suspensionSolicitadaEn != null && !congelada,
      // El vencimiento retenido durante una congelación no es una fecha activa.
      venceEn: pendiente || congelada ? null : licencia.venceEn!.toISOString(),
      bloqueoProgramadoEn: licencia.bloqueoProgramadoEn?.toISOString() ?? null,
      tiempoCongelado: congelada,
      tiempoRestante,
    };
  }
}
