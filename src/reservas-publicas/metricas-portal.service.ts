import { Injectable, Logger } from '@nestjs/common';

type EventoPortal = 'conflicto' | 'expiracion' | 'fallo' | 'recuperacion';

/** Contadores por proceso, sin etiquetas de negocio, sesión ni contacto. */
@Injectable()
export class MetricasPortalService {
  private readonly logger = new Logger('PortalPublico');
  private readonly totales: Record<EventoPortal, number> = {
    conflicto: 0, expiracion: 0, fallo: 0, recuperacion: 0,
  };

  contar(evento: EventoPortal): void {
    const total = ++this.totales[evento];
    // La línea estructurada solo lleva un tipo finito y una cantidad agregada.
    this.logger.log(`portal_publico ${evento} total=${total}`);
  }

  consultar(): Readonly<Record<EventoPortal, number>> {
    return { ...this.totales };
  }
}
