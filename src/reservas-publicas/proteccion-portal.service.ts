import { ForbiddenException, Injectable, ServiceUnavailableException,
  UnauthorizedException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

export const COOKIE_RESERVA = 'reserva_sesion';

/** Origen fijo y token CSRF enlazado a la cookie HttpOnly. */
@Injectable()
export class ProteccionPortalService {
  private origenPermitido(): string {
    const valor = process.env.PORTAL_PUBLICO_ORIGEN;
    if (!valor) throw new ServiceUnavailableException('Portal no configurado.');
    try {
      const url = new URL(valor);
      if (!['https:', 'http:'].includes(url.protocol) || url.origin !== valor ||
        (process.env.NODE_ENV === 'production' && url.protocol !== 'https:')) {
        throw new Error('Origen inválido.');
      }
      return url.origin;
    } catch {
      throw new ServiceUnavailableException('Portal no configurado.');
    }
  }

  private claveCsrf(): string {
    const clave = process.env.PORTAL_CSRF_SECRET;
    if (!clave || clave.length < 32) {
      throw new ServiceUnavailableException('Portal no configurado.');
    }
    return clave;
  }

  /** La inicialización sin cookie usa origen exacto y cabecera no simple;
   * las mutaciones posteriores añaden token CSRF ligado a la credencial. */
  exigirInicializacion(req: Request): void {
    this.exigirOrigen(req);
    if (req.get('X-Portal-Inicializacion') !== '1') {
      throw new ForbiddenException('Solicitud pública no autorizada.');
    }
  }

  exigirMutacion(req: Request, credencial: string): void {
    this.exigirOrigen(req);
    const recibido = req.get('X-CSRF-Token') ?? '';
    const esperado = this.tokenCsrf(credencial);
    if (!/^[a-f0-9]{64}$/.test(recibido) ||
      !timingSafeEqual(Buffer.from(recibido, 'hex'), Buffer.from(esperado, 'hex'))) {
      throw new ForbiddenException('Solicitud pública no autorizada.');
    }
  }

  tokenCsrf(credencial: string): string {
    return createHmac('sha256', this.claveCsrf())
      .update(`portal-csrf:${credencial}`).digest('hex');
  }

  /** Un encabezado duplicado o una cookie duplicada no se interpreta a conveniencia. */
  leerCredencial(req: Request): string | null {
    const cabecera = req.headers.cookie;
    if (!cabecera) return null;
    const valores = cabecera.split(';').map((parte) => parte.trim())
      .filter((parte) => parte.startsWith(`${COOKIE_RESERVA}=`));
    if (!valores.length) return null;
    if (valores.length !== 1) throw new UnauthorizedException('Reinicie la sesión pública.');
    const valor = valores[0].slice(COOKIE_RESERVA.length + 1);
    if (!/^[A-Za-z0-9_-]{43}$/.test(valor)) {
      throw new UnauthorizedException('Reinicie la sesión pública.');
    }
    return valor;
  }

  private exigirOrigen(req: Request): void {
    const origen = req.get('Origin');
    if (!origen || origen !== this.origenPermitido()) {
      throw new ForbiddenException('Origen público no autorizado.');
    }
  }
}
