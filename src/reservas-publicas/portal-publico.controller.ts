import { BadRequestException, Body, Controller, HttpException,
  InternalServerErrorException, Param, Post, Req, Res,
  ServiceUnavailableException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import type { Request, Response } from 'express';
import { ResolverNegocioPublicoService } from './resolver-negocio-publico.service';
import { ProteccionPortalService, COOKIE_RESERVA } from './proteccion-portal.service';
import { SesionReservaPublicaService } from './sesion-reserva-publica.service';

const CODIGOS_TEMPORALES = new Set(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT',
  'PROTOCOL_CONNECTION_LOST', 'ER_CON_COUNT_ERROR', 'ER_LOCK_WAIT_TIMEOUT',
  'ER_LOCK_DEADLOCK']);

/** Traduce fallos sin publicar SQL, cookies, huellas ni trazas. */
function errorPublico(error: unknown): never {
  if (error instanceof HttpException) {
    const status = error.getStatus();
    throw new HttpException({ codigo: `portal_${status}`, mensaje: error.message,
      accion: status === 401 ? 'reiniciar' : status === 503 ? 'reintentar' :
        status === 404 ? 'volver' : 'corregir' }, status);
  }
  const datos = error as { code?: unknown; driverError?: { code?: unknown } } | null;
  const codigo = error instanceof QueryFailedError ? datos?.driverError?.code : datos?.code;
  if (typeof codigo === 'string' && CODIGOS_TEMPORALES.has(codigo)) {
    throw new ServiceUnavailableException({ codigo: 'portal_503',
      mensaje: 'Portal temporalmente no disponible.', accion: 'reintentar' });
  }
  throw new InternalServerErrorException({ codigo: 'portal_500',
    mensaje: 'No se pudo iniciar la reserva.', accion: 'reintentar' });
}

/** Única ruta pública de este lote: crea o reutiliza la identidad del navegador. */
@Controller('publico/negocios/:slug')
export class PortalPublicoController {
  constructor(private readonly negocios: ResolverNegocioPublicoService,
    private readonly proteccion: ProteccionPortalService,
    private readonly sesiones: SesionReservaPublicaService) {}

  @Post('sesion')
  async iniciar(@Param('slug') slug: string, @Body() cuerpo: unknown,
    @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    // La respuesta personal nunca se almacena, incluso ante un rechazo.
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Vary', 'Cookie, Origin');
    try {
      this.proteccion.exigirInicializacion(req);
      if (cuerpo !== undefined && (cuerpo === null || typeof cuerpo !== 'object' ||
        Array.isArray(cuerpo) || Object.keys(cuerpo).length !== 0)) {
        throw new BadRequestException('La inicialización no acepta datos personales.');
      }
      const negocio = await this.negocios.resolver(slug);
      const recibida = this.proteccion.leerCredencial(req);
      const sesion = await this.sesiones.iniciar(negocio.id, recibida);
      const atributoSeguro = process.env.NODE_ENV === 'production' ? '; Secure' : '';
      // Path acota la cookie al negocio; HttpOnly impide leerla desde JavaScript.
      res.setHeader('Set-Cookie', `${COOKIE_RESERVA}=${sesion.credencial}; ` +
        `Path=/publico/negocios/${encodeURIComponent(negocio.slug)}; ` +
        `HttpOnly; SameSite=Strict${atributoSeguro}`);
      res.status(sesion.nueva ? 201 : 200);
      return { negocio: { slug: negocio.slug, nombre: negocio.nombre },
        csrfToken: this.proteccion.tokenCsrf(sesion.credencial) };
    } catch (error) { errorPublico(error); }
  }
}
