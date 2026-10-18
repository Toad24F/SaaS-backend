import { BadRequestException, Body, Controller, Get,
  Param, Post, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ResolverNegocioPublicoService } from './resolver-negocio-publico.service';
import { ProteccionPortalService, COOKIE_RESERVA } from './proteccion-portal.service';
import { SesionReservaPublicaService } from './sesion-reserva-publica.service';
import { CatalogoPublicoService } from './catalogo-publico.service';
import { validarCatalogoPublico, validarDisponibilidadPublica } from './entradas-publicas';
import { MotorDisponibilidadService } from '../disponibilidad/motor-disponibilidad.service';
import { normalizarErrorPublico } from './errores-publicos';

/** Rutas de lectura anónima y creación de identidad del navegador. */
@Controller('publico/negocios/:slug')
export class PortalPublicoController {
  constructor(private readonly negocios: ResolverNegocioPublicoService,
    private readonly proteccion: ProteccionPortalService,
    private readonly sesiones: SesionReservaPublicaService,
    private readonly catalogo: CatalogoPublicoService,
    private readonly motor: MotorDisponibilidadService) {}

  @Get('catalogo')
  async consultarCatalogo(@Param('slug') slug: string, @Query() query: unknown,
    @Res({ passthrough: true }) res: Response) {
    // El portal consulta sin sesión; la respuesta no arrastra un catálogo obsoleto.
    res.setHeader('Cache-Control', 'no-store');
    try { return await this.catalogo.consultar(slug, validarCatalogoPublico(query)); }
    catch (error) { throw normalizarErrorPublico(error); }
  }

  @Get('disponibilidad')
  async consultarDisponibilidad(@Param('slug') slug: string, @Query() query: unknown,
    @Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    try {
      // El slug determina el tenant y el motor vuelve a autorizar dentro de
      // su instantánea junto con configuración, horarios y ocupaciones.
      const entrada = validarDisponibilidadPublica(query);
      const negocio = await this.negocios.resolver(slug);
      return await this.motor.consultarPublico(negocio.id, entrada.personalId,
        entrada.sucursalId, entrada.servicioId, entrada.desde, entrada.hasta);
    } catch (error) { throw normalizarErrorPublico(error); }
  }

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
    } catch (error) { throw normalizarErrorPublico(error); }
  }
}
