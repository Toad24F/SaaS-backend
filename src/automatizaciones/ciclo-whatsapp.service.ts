import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { CancelacionAutomaticaCitasService } from './cancelacion-automatica-citas.service';
import { ProcesadorWhatsappService } from './procesador-whatsapp.service';
import { RecepcionWhatsappService } from './recepcion-whatsapp.service';

export const CONFIGURACION_CICLO_WHATSAPP = Symbol('CONFIGURACION_CICLO_WHATSAPP');
const INTERVALO_MS = 15_000;
const LIMITE_LOTE = 50;

export interface ConfiguracionCicloWhatsapp {
  envios: boolean;
  cancelaciones: boolean;
  secretoApp?: string;
}

/** Cada instancia ejecuta un ciclo a la vez. SQL coordina las instancias entre sí. */
@Injectable()
export class CicloWhatsappService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(CicloWhatsappService.name);
  private temporizador: NodeJS.Timeout | null = null;
  private enCurso: Promise<void> | null = null;
  private detenido = false;

  constructor(@Inject(ProcesadorWhatsappService) private readonly envios: Pick<ProcesadorWhatsappService, 'ejecutarUna'>,
    @Inject(CancelacionAutomaticaCitasService) private readonly cancelaciones: Pick<CancelacionAutomaticaCitasService, 'ejecutarLote'>,
    @Inject(RecepcionWhatsappService) private readonly recepcion: Pick<RecepcionWhatsappService, 'procesarLote'>,
    @Inject(CONFIGURACION_CICLO_WHATSAPP) private readonly config: ConfiguracionCicloWhatsapp) {}

  onApplicationBootstrap(): void {
    if (this.temporizador || (!this.config.envios && !this.config.cancelaciones && !this.config.secretoApp)) return;
    this.detenido = false;
    this.temporizador = setInterval(() => { void this.ciclo(); }, INTERVALO_MS);
    this.temporizador.unref();
    void this.ciclo();
  }

  ciclo(): Promise<void> {
    if (this.detenido) return Promise.resolve();
    this.enCurso ??= this.ejecutar().finally(() => { this.enCurso = null; });
    return this.enCurso;
  }

  async onModuleDestroy(): Promise<void> {
    this.detenido = true;
    if (this.temporizador) clearInterval(this.temporizador);
    this.temporizador = null;
    await this.enCurso;
  }

  private async ejecutar(): Promise<void> {
    const { secretoApp } = this.config;
    // Un error en una bandeja deja el trabajo en SQL y las demás etapas pueden avanzar.
    if (secretoApp) await this.recepcion.procesarLote(secretoApp, LIMITE_LOTE)
      .catch(() => this.logger.error('Ciclo de recepción WhatsApp no disponible.'));
    if (!this.detenido && this.config.cancelaciones) await this.cancelaciones.ejecutarLote(LIMITE_LOTE)
      .catch(() => this.logger.error('Ciclo de cancelación automática no disponible.'));
    if (!this.config.envios) return;
    try {
      for (let i = 0; i < LIMITE_LOTE && !this.detenido; i++) {
        if (!await this.envios.ejecutarUna()) break;
      }
    } catch { this.logger.error('Ciclo de envío WhatsApp no disponible.'); }
  }
}
