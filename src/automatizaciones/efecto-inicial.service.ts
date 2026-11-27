import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { Cita } from '../disponibilidad/entities/cita.entity';
import { CanalWhatsapp } from './entities/canal-whatsapp.entity';
import { CondicionConfirmacionCita } from './entities/condicion-confirmacion-cita.entity';
import { ConfiguracionAutomatizaciones } from './entities/configuracion-automatizaciones.entity';
import { guardarEnvioCita, programarRecordatorioCita } from './envios-cita';
import { calcularVencimientoConfirmacion } from './politica-temporal';
import { destinoWhatsapp } from '../comun/telefono-whatsapp';

/** Añade la política y los trabajos al mismo manager de la cita; nunca llama al proveedor. */
@Injectable()
export class EfectoInicialService {
  async preparar(manager: EntityManager, cita: Cita, ahora: Date,
    autorizaWhatsapp = false): Promise<void> {
    const generacion = 1;
    // El intento registrado se recupera sin repetir escrituras ni reemplazar su política histórica.
    if (await manager.findOneBy(CondicionConfirmacionCita,
      { negocioId: cita.negocioId, citaId: cita.id, generacion })) return;
    const [configuracion, canal] = await Promise.all([
      manager.findOneBy(ConfiguracionAutomatizaciones, { negocioId: cita.negocioId }),
      manager.findOneBy(CanalWhatsapp, { negocioId: cita.negocioId }),
    ]);
    const politica = calcularVencimientoConfirmacion(ahora, cita.inicioUtc,
      configuracion?.plazoConfirmacionHoras ?? 12);
    const comunicable = autorizaWhatsapp && canal?.habilitado === 1 && Boolean(destinoWhatsapp(cita.telefonoContacto));
    const manual = cita.origen === 'manual';
    const vencimientoUtc = manual || !comunicable ? null : politica.vencimientoUtc;
    const seguimiento = !comunicable || (!manual && !vencimientoUtc);
    const condicion = await manager.getRepository(CondicionConfirmacionCita).save({
      negocioId: cita.negocioId, citaId: cita.id, generacion,
      categoria: politica.categoria, instanteBase: ahora,
      plazoAplicadoMinutos: vencimientoUtc ? politica.plazoAplicadoMinutos : null,
      vencimientoUtc,
      contactoAutorizado: autorizaWhatsapp ? 1 : 0,
      motivoSeguimiento: seguimiento
        ? (!autorizaWhatsapp ? 'Contacto WhatsApp no autorizado.'
          : !comunicable ? 'Canal de contacto no disponible.' : politica.motivoSeguimiento) : null,
      estadoPolitica: seguimiento ? 'seguimiento_manual' : manual ? 'confirmada' : 'pendiente',
      versionConfiguracion: configuracion?.version ?? 0,
      confirmadoEn: manual ? ahora : null, origenConfirmacion: manual ? 'personal' : null,
    });
    // El vínculo vigente se publica dentro del mismo commit que la condición y la cita.
    await manager.update(Cita, { id: cita.id, negocioId: cita.negocioId },
      { generacionAutomatizacion: generacion, condicionVigenteId: condicion.id });
    if (!comunicable) return;
    // La unicidad por cita, generación y tipo es la última barrera ante reintentos concurrentes.
    await guardarEnvioCita(manager, cita, generacion, manual ? 'inicial_confirmada' : 'inicial_pendiente', ahora, vencimientoUtc ?? cita.inicioUtc);
    if (manual) {
      await programarRecordatorioCita(manager, cita, generacion, ahora,
        configuracion?.recordatorioHoras ?? 24, politica.categoria === 'proxima');
    }
  }
}
