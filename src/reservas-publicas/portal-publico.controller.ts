import { BadRequestException, Body, ConflictException, Controller, Get,
  Param, Post, Query, Req, Res, UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { createHash } from 'node:crypto';
import { ResolverNegocioPublicoService } from './resolver-negocio-publico.service';
import { ProteccionPortalService, COOKIE_RESERVA } from './proteccion-portal.service';
import { SesionReservaPublicaService } from './sesion-reserva-publica.service';
import { CatalogoPublicoService } from './catalogo-publico.service';
import { validarCatalogoPublico, validarDisponibilidadPublica } from './entradas-publicas';
import { MotorDisponibilidadService } from '../disponibilidad/motor-disponibilidad.service';
import { normalizarErrorPublico } from './errores-publicos';
import { ApartadosService } from './apartados.service';
import { IntentosReservaPublicaService } from './intentos-reserva-publica.service';
import { RegistroReservaPublicaService } from './registro-reserva-publica.service';
import { ResolucionReservaPublicaService } from './resolucion-reserva-publica.service';
import { MetricasPortalService } from './metricas-portal.service';

/** Frontera pública: selección, apartados, reserva y recuperación del envío propio. */
@Controller('publico/negocios/:slug')
export class PortalPublicoController {
  constructor(private readonly negocios: ResolverNegocioPublicoService,
    private readonly proteccion: ProteccionPortalService,
    private readonly sesiones: SesionReservaPublicaService,
    private readonly catalogo: CatalogoPublicoService,
    private readonly motor: MotorDisponibilidadService,
    private readonly apartados: ApartadosService,
    private readonly intentos: IntentosReservaPublicaService,
    private readonly registro: RegistroReservaPublicaService,
    private readonly resolucion: ResolucionReservaPublicaService,
    private readonly metricas: MetricasPortalService) {}

  /** Clasifica el estado público, sin incorporar la excepción ni la entrada al log. */
  private errorSeguro(error: unknown) {
    const publico = normalizarErrorPublico(error);
    if (publico.getStatus() === 409) this.metricas.contar('conflicto');
    if (publico.getStatus() === 500 || publico.getStatus() === 503) {
      this.metricas.contar('fallo');
    }
    return publico;
  }

  /** :id es la clave opaca del navegador, utilizable incluso si preparar no llegó.
   * El ID SQL permanece interno; sesión y negocio acotan siempre esa clave. */
  private claveIntento(id: string): string {
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(id)) {
      throw new BadRequestException('Clave de intento inválida.');
    }
    return id;
  }

  @Post('intentos')
  async prepararIntento(@Param('slug') slug: string, @Body() cuerpo: unknown,
    @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Vary', 'Cookie, Origin');
    try {
      const titular = this.titular(req);
      this.proteccion.exigirMutacion(req, titular.credencial);
      const negocio = await this.negocios.resolver(slug);
      await this.sesiones.exigirCredencial(negocio.id, titular.hash);
      const { resultado, repetida } = await this.intentos.prepararConMeta(negocio.id, titular.hash, cuerpo);
      res.status(repetida ? 200 : 201);
      return { id: (cuerpo as { clave: string }).clave,
        apartadoId: resultado.apartadoId, estado: resultado.estado };
    } catch (error) { throw this.errorSeguro(error); }
  }

  @Post('intentos/:id/reservar')
  async reservarIntento(@Param('slug') slug: string, @Param('id') id: string,
    @Body() cuerpo: unknown, @Req() req: Request,
    @Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Vary', 'Cookie, Origin');
    try {
      const titular = this.titular(req);
      this.proteccion.exigirMutacion(req, titular.credencial);
      const clave = this.claveIntento(id);
      // Una repetición registrada debe llegar al escritor aun sin licencia.
      // Para un envío nuevo el motor autoriza bajo los bloqueos del dominio.
      const negocio = await this.negocios.resolverParaLiberar(slug);
      await this.sesiones.exigirCredencial(negocio.id, titular.hash);
      const { resultado, repetida } = await this.registro.registrarConMeta(
        negocio.id, titular.hash, clave, cuerpo);
      if (repetida) this.metricas.contar('recuperacion');
      res.status(repetida ? 200 : 201);
      return resultado;
    } catch (error) { throw this.errorSeguro(error); }
  }

  @Post('intentos/:id/resolver')
  async resolverIntento(@Param('slug') slug: string, @Param('id') id: string,
    @Body() cuerpo: unknown, @Req() req: Request,
    @Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Vary', 'Cookie, Origin');
    try {
      const titular = this.titular(req);
      this.proteccion.exigirMutacion(req, titular.credencial);
      const clave = this.claveIntento(id);
      if (!cuerpo || typeof cuerpo !== 'object' || Array.isArray(cuerpo) ||
        Object.keys(cuerpo).length !== 1 || !Object.hasOwn(cuerpo, 'apartadoId')) {
        throw new BadRequestException('Resolución inválida.');
      }
      const negocio = await this.negocios.resolverParaLiberar(slug);
      await this.sesiones.exigirCredencial(negocio.id, titular.hash);
      // El servicio valida el ID y cierra la ausencia de forma durable bajo
      // exclusión: un timeout nunca se transforma aquí en no_registrado.
      const resultado = await this.resolucion.resolver(negocio.id, titular.hash,
        clave, (cuerpo as { apartadoId: number }).apartadoId);
      if (resultado.estado === 'registrado') this.metricas.contar('recuperacion');
      res.status(200);
      return resultado;
    } catch (error) { throw this.errorSeguro(error); }
  }

  private titular(req: Request): { credencial: string; hash: string } {
    const credencial = this.proteccion.leerCredencial(req);
    if (!credencial) throw new UnauthorizedException('Reinicie la sesión pública.');
    // La identidad nunca procede del cuerpo ni de una cabecera editable.
    return { credencial, hash: createHash('sha256').update(credencial).digest('hex') };
  }

  private idApartado(id: string): number {
    if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) {
      throw new BadRequestException('Apartado inválido.');
    }
    return Number(id);
  }

  @Get('catalogo')
  async consultarCatalogo(@Param('slug') slug: string, @Query() query: unknown,
    @Res({ passthrough: true }) res: Response) {
    // El portal consulta sin sesión; la respuesta no arrastra un catálogo obsoleto.
    res.setHeader('Cache-Control', 'no-store');
    try { return await this.catalogo.consultar(slug, validarCatalogoPublico(query)); }
    catch (error) { throw this.errorSeguro(error); }
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
    } catch (error) { throw this.errorSeguro(error); }
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
    } catch (error) { throw this.errorSeguro(error); }
  }

  @Post('apartados')
  async crearApartado(@Param('slug') slug: string, @Body() cuerpo: unknown,
    @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Vary', 'Cookie, Origin');
    try {
      const titular = this.titular(req);
      this.proteccion.exigirMutacion(req, titular.credencial);
      const negocio = await this.negocios.resolver(slug);
      await this.sesiones.exigirCredencial(negocio.id, titular.hash);
      const { resultado, repetida, servidorAhora } = await this.apartados.solicitarConMeta(
        negocio.id, titular.hash, cuerpo);
      if (resultado.estado !== 'concedida') {
        throw new ConflictException('Apartado no concedido.');
      }
      res.status(repetida ? 200 : 201);
      return { ...resultado, servidorAhora };
    } catch (error) { throw this.errorSeguro(error); }
  }

  @Get('apartados/:id')
  async consultarApartado(@Param('slug') slug: string, @Param('id') id: string,
    @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Vary', 'Cookie');
    try {
      const titular = this.titular(req);
      const apartadoId = this.idApartado(id);
      const negocio = await this.negocios.resolver(slug);
      await this.sesiones.exigirCredencial(negocio.id, titular.hash);
      const resultado = await this.apartados.consultar(negocio.id, titular.hash, apartadoId);
      if (resultado.estado === 'vencido') this.metricas.contar('expiracion');
      return resultado;
    } catch (error) { throw this.errorSeguro(error); }
  }

  @Post('apartados/:id/liberar')
  async liberarApartado(@Param('slug') slug: string, @Param('id') id: string,
    @Body() cuerpo: unknown, @Req() req: Request,
    @Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Vary', 'Cookie, Origin');
    try {
      const titular = this.titular(req);
      this.proteccion.exigirMutacion(req, titular.credencial);
      const apartadoId = this.idApartado(id);
      if (!cuerpo || typeof cuerpo !== 'object' || Array.isArray(cuerpo) ||
        Object.keys(cuerpo).length !== 1 ||
        !/^[1-9]\d*$/.test((cuerpo as Record<string, unknown>).generacion as string)) {
        throw new BadRequestException('Generación inválida.');
      }
      // Solo la liberación evita el cierre de licencia; propiedad y CSRF siguen vigentes.
      const negocio = await this.negocios.resolverParaLiberar(slug);
      await this.sesiones.exigirCredencial(negocio.id, titular.hash);
      await this.apartados.liberar(negocio.id, titular.hash, apartadoId,
        (cuerpo as { generacion: string }).generacion);
      res.status(204);
      return;
    } catch (error) { throw this.errorSeguro(error); }
  }
}
