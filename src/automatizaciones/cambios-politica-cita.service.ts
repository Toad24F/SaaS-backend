import { ConflictException, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { Cita } from '../disponibilidad/entities/cita.entity';
import { CanalWhatsapp } from './entities/canal-whatsapp.entity';
import { CondicionConfirmacionCita } from './entities/condicion-confirmacion-cita.entity';
import { ConfiguracionAutomatizaciones } from './entities/configuracion-automatizaciones.entity';
import { descartarEnviosSinTransporte, programarAlConfirmar, programarRecordatorioCita } from './envios-cita';
import { calcularVencimientoConfirmacion } from './politica-temporal';

/** Las transiciones reutilizan el manager del escritor, con negocio, Profesional y cita ya bloqueados. */
@Injectable()
export class CambiosPoliticaCitaService {
  async sustituir(manager: EntityManager, cita: Cita, actual: Cita, ahora: Date,
    estado: 'confirmada' | 'seguimiento_manual'): Promise<Pick<Cita, 'generacionAutomatizacion' | 'condicionVigenteId'>> {
    const { negocioId, id: citaId } = cita;
    const anterior = await this.condicionVigente(manager, cita);
    const generacion = (cita.generacionAutomatizacion ?? 0) + 1;
    if (generacion > 4_294_967_295) throw new ConflictException('La cita alcanzó su generación máxima.');
    if (anterior) {
      const alcance = { negocioId, citaId, generacion: anterior.generacion };
      await descartarEnviosSinTransporte(manager, alcance, 'generacion_sustituida');
      if (anterior.estadoPolitica !== 'cancelada') {
        await manager.update(CondicionConfirmacionCita, anterior.id,
          { estadoPolitica: cita.estado === 'cancelada' ? 'cancelada' : 'anulada' });
      }
    }

    const configuracion = await manager.findOneBy(ConfiguracionAutomatizaciones, { negocioId });
    const { categoria } = calcularVencimientoConfirmacion(ahora, actual.inicioUtc, configuracion?.plazoConfirmacionHoras ?? 12);
    const confirmada = estado === 'confirmada';
    const contactoAutorizado = anterior?.contactoAutorizado ?? 0;
    // El plazo anterior se conserva en su fila histórica. La nueva generación carece de cancelación por plazo.
    const nueva = await manager.save(CondicionConfirmacionCita, { negocioId, citaId, generacion, categoria,
      instanteBase: ahora, plazoAplicadoMinutos: null, vencimientoUtc: null, contactoAutorizado, estadoPolitica: estado,
      motivoSeguimiento: confirmada ? null : 'La cita volvió a Pendiente y requiere seguimiento manual.',
      versionConfiguracion: configuracion?.version ?? 0, confirmadoEn: confirmada ? ahora : null,
      origenConfirmacion: confirmada ? 'personal' : null });

    if (confirmada && contactoAutorizado === 1 && /^\d{10}$/.test(actual.telefonoContacto ?? '')) {
      const canal = await manager.findOneBy(CanalWhatsapp, { negocioId });
      if (canal?.habilitado === 1) await programarRecordatorioCita(manager, actual, generacion,
        ahora, configuracion?.recordatorioHoras ?? 24, categoria === 'proxima');
    }
    return { generacionAutomatizacion: generacion, condicionVigenteId: nueva.id };
  }

  async cerrarCondicion(manager: EntityManager, cita: Cita, ahora: Date, estado: 'cancelada' | 'confirmada'): Promise<void> {
    const condicion = await this.condicionVigente(manager, cita);
    if (!condicion) return;
    if (estado === 'cancelada') await descartarEnviosSinTransporte(manager, {
      negocioId: cita.negocioId, citaId: cita.id, generacion: condicion.generacion, tipo: 'recordatorio',
    }, 'cita_cancelada');
    // El cambio de estado ordinario conserva la generación y el plazo histórico de la cita.
    await manager.update(CondicionConfirmacionCita, condicion.id, estado === 'cancelada' ? { estadoPolitica: 'cancelada' }
      : { estadoPolitica: 'confirmada', confirmadoEn: ahora, origenConfirmacion: 'personal' });
    if (estado === 'confirmada') await programarAlConfirmar(manager, cita, condicion, ahora);
  }

  private condicionVigente(manager: EntityManager, cita: Cita) {
    return cita.condicionVigenteId && cita.generacionAutomatizacion
      ? manager.findOneBy(CondicionConfirmacionCita, { negocioId: cita.negocioId, citaId: cita.id,
        id: cita.condicionVigenteId, generacion: cita.generacionAutomatizacion }) : Promise.resolve(null);
  }
}
