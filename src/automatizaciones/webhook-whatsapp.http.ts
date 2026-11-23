import { BadRequestException, Controller, ForbiddenException, Get, Header, Headers, HttpCode,
  Inject, Post, Query, Req, type INestApplication } from '@nestjs/common';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { raw, type ErrorRequestHandler, type Request, type RequestHandler } from 'express';
import { extraerRecibosWhatsapp } from './recibos-whatsapp';
import { RecepcionWhatsappService } from './recepcion-whatsapp.service';

export const CONFIGURACION_WEBHOOK_WHATSAPP = Symbol('CONFIGURACION_WEBHOOK_WHATSAPP');

export interface ConfiguracionWebhookWhatsapp {
  secretoApp?: string;
  tokenVerificacion?: string;
}

/** Captura bytes únicamente en el callback, antes del parser JSON global. */
export function instalarCuerpoWebhookWhatsapp(app: INestApplication): void {
  const leer = raw({ type: 'application/json', limit: 3 * 1024 * 1024, inflate: false });
  const capturar: RequestHandler = (req, res, next) => req.method === 'POST' ? leer(req, res, next) : next();
  const errorCuerpo: ErrorRequestHandler = (_error, _req, res, _next) => {
    res.status(400).json({ message: 'Cuerpo de webhook inválido.' });
  };
  app.use('/webhooks/whatsapp', capturar, errorCuerpo);
}

@Controller('webhooks/whatsapp')
export class WebhookWhatsappController {
  constructor(@Inject(CONFIGURACION_WEBHOOK_WHATSAPP) private readonly config: ConfiguracionWebhookWhatsapp,
    private readonly recepcion: RecepcionWhatsappService) {}

  @Get()
  @Header('Content-Type', 'text/plain; charset=utf-8')
  verificar(@Query('hub.mode') modo: unknown, @Query('hub.verify_token') token: unknown,
    @Query('hub.challenge') reto: unknown): string {
    if (modo !== 'subscribe' || typeof reto !== 'string' || !/^[\x20-\x7e]{1,255}$/.test(reto) || typeof token !== 'string') {
      throw new BadRequestException('Solicitud de verificación inválida.');
    }
    const esperado = this.config.tokenVerificacion;
    // Las huellas tienen el mismo tamaño aunque el token recibido tenga otra longitud.
    const huella = (valor: string) => createHash('sha256').update(valor).digest();
    if (!esperado || !timingSafeEqual(huella(token), huella(esperado))) throw new ForbiddenException('Verificación inválida.');
    return reto;
  }

  @Post()
  @HttpCode(200)
  async recibir(@Req() req: Request, @Headers('x-hub-signature-256') firma: unknown) {
    const secreto = this.config.secretoApp;
    const cuerpo: unknown = req.body;
    if (!secreto || typeof firma !== 'string' || !/^sha256=[a-fA-F0-9]{64}$/.test(firma) || !Buffer.isBuffer(cuerpo)
      || !timingSafeEqual(createHmac('sha256', secreto).update(cuerpo).digest(), Buffer.from(firma.slice(7), 'hex'))) {
      throw new ForbiddenException('Firma de webhook inválida.');
    }

    // Se decodifica y valida únicamente después de autenticar los bytes originales.
    let datos: unknown;
    try {
      datos = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(cuerpo));
    } catch {
      throw new BadRequestException('JSON de webhook inválido.');
    }
    await this.recepcion.recibir(extraerRecibosWhatsapp(datos, secreto), secreto);
    return { recibido: true };
  }
}
