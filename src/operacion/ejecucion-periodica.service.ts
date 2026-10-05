import { Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy,
  Optional } from '@nestjs/common';
import { ProcesadorCorreoService } from '../correos/procesador-correo.service';
import { RELOJ, type Reloj } from '../comun/reloj';
import { verificarConfiguracionCorreo } from '../config/configuracion-correo';
import { AvisosVencimientoService } from '../licencias/services/avisos-vencimiento.service';
import { ConciliadorSuspensionesService } from '../licencias/services/conciliador-suspensiones.service';

export const EJECUTOR_AUTOMATICO = Symbol('EJECUTOR_AUTOMATICO');
const INTERVALO_MS = 60_000;
const MAX_ENVIOS_CICLO = 100;

/** Une reconciliación y bandeja; cada ciclo puede repetirse tras una caída. */
@Injectable()
export class EjecucionPeriodicaService implements OnApplicationBootstrap, OnModuleDestroy {
  private temporizador: NodeJS.Timeout | null = null;
  private enCurso = false;
  private readonly logger = new Logger(EjecucionPeriodicaService.name);

  constructor(private readonly conciliador: ConciliadorSuspensionesService,
    private readonly avisos: AvisosVencimientoService,
    private readonly correo: ProcesadorCorreoService,
    @Inject(RELOJ) private readonly reloj: Reloj,
    @Optional() @Inject(EJECUTOR_AUTOMATICO)
    private readonly automatico = process.env.NODE_ENV !== 'test') {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.automatico) return;
    // En producción la ausencia de secretos impide arrancar el envío automático.
    if (process.env.NODE_ENV !== 'test') verificarConfiguracionCorreo(process.env);
    await this.ciclo();
    this.temporizador = setInterval(() => {
      void this.ciclo().catch(() => this.logger.error('Ciclo de correo no disponible.'));
    }, INTERVALO_MS);
    this.temporizador.unref();
  }

  async ciclo(): Promise<void> {
    if (this.enCurso) return;
    this.enCurso = true;
    try {
      const ahora = this.reloj.ahora();
      await this.conciliador.conciliar(ahora);
      await this.avisos.detectar(ahora);
      // Un límite por vuelta evita monopolizar el proceso ante una cola grande.
      for (let i = 0; i < MAX_ENVIOS_CICLO; i++) {
        if (!await this.correo.procesarUno()) break;
      }
    } finally { this.enCurso = false; }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.temporizador) clearInterval(this.temporizador);
    this.temporizador = null;
  }
}
