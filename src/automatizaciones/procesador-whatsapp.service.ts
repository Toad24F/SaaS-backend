import { Inject, Injectable, Optional } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { bloquearNegocioAgenda } from '../comun/bloqueos-coordinados';
import { RELOJ, type Reloj } from '../comun/reloj';
import { Cita } from '../disponibilidad/entities/cita.entity';
import { Licencia } from '../licencias/entities/licencia.entity';
import { PoliticaAccesoLicenciaService } from '../licencias/services/politica-acceso-licencia.service';
import { Negocio } from '../negocios/entities/negocio.entity';
import { ArrendamientoWhatsappService, type TomaWhatsapp } from './arrendamiento-whatsapp.service';
import { CanalWhatsapp } from './entities/canal-whatsapp.entity';
import { CondicionConfirmacionCita } from './entities/condicion-confirmacion-cita.entity';
import type { EnvioWhatsapp } from './entities/envio-whatsapp.entity';
import { construirPlantillaWhatsapp } from './plantillas-whatsapp';
import { envioVigenteHasta } from './envios-cita';
import { derivarSeguimientoWhatsapp } from './seguimiento-whatsapp';
import { TRANSPORTE_WHATSAPP, type ResultadoWhatsapp, type SolicitudWhatsapp, type TransporteWhatsapp } from './transporte-whatsapp';

export const PREPARAR_ACCION_WHATSAPP = Symbol('PREPARAR_ACCION_WHATSAPP');
// La acción guarda su hash en la misma preparación, sin E/S externa.
type PrepararAccionWhatsapp = (manager: EntityManager, envio: EnvioWhatsapp,
  cita: Cita, condicion: CondicionConfirmacionCita, canal: CanalWhatsapp, ahora: Date) => Promise<string | null>;

/** Ejecuta un trabajo por llamada; el planificador operativo puede invocarlo en otro ciclo. */
@Injectable()
export class ProcesadorWhatsappService {
  constructor(private readonly db: DataSource, @Inject(RELOJ) private readonly reloj: Reloj,
    private readonly arrendamientos: ArrendamientoWhatsappService,
    private readonly politicaLicencia: PoliticaAccesoLicenciaService,
    @Inject(TRANSPORTE_WHATSAPP) private readonly transporte: TransporteWhatsapp,
    @Optional() @Inject(PREPARAR_ACCION_WHATSAPP) private readonly prepararAccion?: PrepararAccionWhatsapp) {}

  async ejecutarUna(): Promise<boolean> {
    if (await this.arrendamientos.recuperarIncierto()) return true;
    const toma = await this.arrendamientos.tomar(Boolean(this.prepararAccion));
    if (!toma) return false;
    const solicitud = await this.preparar(toma);
    if (!solicitud) return true;

    // La marca de transporte ya está confirmada. La espera de Meta no conserva locks SQL.
    let resultado: ResultadoWhatsapp;
    try {
      resultado = await this.transporte.enviar(solicitud);
    } catch {
      resultado = { estado: 'incierto' };
    }
    await this.arrendamientos.finalizar(toma, resultado);
    return true;
  }

  private preparar(toma: TomaWhatsapp): Promise<SolicitudWhatsapp | null> {
    return this.db.transaction('READ COMMITTED', async (manager) => {
      // Se libera la toma inicial antes de adquirir dominio, en orden negocio → licencia → cita → envío.
      await bloquearNegocioAgenda(manager, toma.negocioId);
      const licencia = await manager.getRepository(Licencia).findOne({ where: { negocioId: toma.negocioId },
        lock: { mode: 'pessimistic_write' } });
      const canal = await manager.getRepository(CanalWhatsapp).findOne({ where: { negocioId: toma.negocioId },
        lock: { mode: 'pessimistic_write' } });
      const cita = await manager.getRepository(Cita).findOne({ where: { id: toma.citaId, negocioId: toma.negocioId },
        lock: { mode: 'pessimistic_write' } });
      const vigente = await this.arrendamientos.leerVigente(manager, toma);
      if (!vigente || vigente.envio.inicioTransporteEn) return null;
      const { envio, ahora } = vigente;
      const condicion = cita?.condicionVigenteId ? await manager.findOneBy(CondicionConfirmacionCita,
        { id: cita.condicionVigenteId, negocioId: envio.negocioId, citaId: envio.citaId, generacion: envio.generacion }) : null;
      if (!cita || !condicion || !esUtil(envio, cita, condicion, ahora)) {
        await this.arrendamientos.cerrar(manager, envio, 'descartado', 'envio_fuera_de_vigencia');
        return null;
      }
      const negocio = await manager.findOneByOrFail(Negocio, { id: toma.negocioId });
      if (!licencia || !this.politicaLicencia.puedeAceptarReserva(Boolean(negocio.activadoEn), licencia, ahora)
        || canal?.habilitado !== 1) {
        await this.cerrarPorAcceso(manager, envio, cita);
        return null;
      }

      const plantilla = construirPlantillaWhatsapp(envio.tipo, cita, condicion.vencimientoUtc);
      if (envio.tipo === 'inicial_pendiente') {
        const accion = await this.prepararAccion?.(manager, envio, cita, condicion, canal, ahora);
        if (!accion) {
          await this.arrendamientos.cerrar(manager, envio, 'descartado', 'accion_fuera_de_vigencia');
          return null;
        }
        plantilla.respuestaRapida = accion;
      }
      const inicioTransporte = this.reloj.ahora();
      if (!esUtil(envio, cita, condicion, inicioTransporte)) {
        await this.arrendamientos.cerrar(manager, envio, 'descartado', 'envio_fuera_de_vigencia');
        return null;
      }
      if (!envio.arrendadoHasta || envio.arrendadoHasta <= inicioTransporte) return null;
      // Los locks mantienen la configuración estable, pero la licencia puede vencer mientras se prepara el botón.
      if (!this.politicaLicencia.puedeAceptarReserva(Boolean(negocio.activadoEn), licencia, inicioTransporte)) {
        await this.cerrarPorAcceso(manager, envio, cita);
        return null;
      }
      const correlacion = await this.arrendamientos.iniciarTransporte(manager, envio, inicioTransporte);
      return { canal, destinoE164: envio.destinoE164, tipo: envio.tipo, plantilla, correlacion };
    });
  }

  private async cerrarPorAcceso(manager: EntityManager, envio: EnvioWhatsapp, cita: Cita): Promise<void> {
    await this.arrendamientos.cerrar(manager, envio, 'fallido', 'canal_o_licencia_no_disponible');
    await derivarSeguimientoWhatsapp(manager, envio, cita, 'Canal WhatsApp o licencia no disponible.');
  }
}

function esUtil(envio: EnvioWhatsapp, cita: Cita, condicion: CondicionConfirmacionCita, ahora: Date): boolean {
  // El inicio congelado detecta movimientos incluso mientras las gestiones previas aún conservan la generación.
  if (cita.generacionAutomatizacion !== envio.generacion || condicion.contactoAutorizado !== 1
    || !envioVigenteHasta(envio, cita, ahora.getTime()) || envio.programadoEn > ahora
    || envio.parametrosPlantilla.inicioUtc !== cita.inicioUtc.toISOString()) return false;
  if (envio.tipo === 'inicial_pendiente') {
    return cita.estado === 'pendiente' && (condicion.estadoPolitica === 'pendiente'
      || (condicion.estadoPolitica === 'seguimiento_manual' && condicion.vencimientoUtc === null))
      && (!condicion.vencimientoUtc || ahora < condicion.vencimientoUtc);
  }
  return cita.estado === 'confirmada' && condicion.estadoPolitica === 'confirmada'
    && (envio.tipo !== 'recordatorio' || condicion.categoria === 'normal');
}
