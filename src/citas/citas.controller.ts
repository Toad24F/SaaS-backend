import { BadRequestException, Body, Controller, Get, Header, HttpCode, Param, Post, Query, Res, UseFilters, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { ConsultaAgendaService } from './consulta-agenda.service';
import { ErroresOperativosFilter } from './errores-operativos.filter';
import { IntentosCitaManualService } from './intentos-cita-manual.service';
import { RegistroCitaManualService } from './registro-cita-manual.service';

/** El guard autentica la sesión; cada caso de uso relee permisos y pertenencia en servidor. */
@Controller('citas')
@UseGuards(JwtAuthGuard)
@UseFilters(ErroresOperativosFilter)
export class CitasController {
  constructor(private readonly agenda: ConsultaAgendaService,
    private readonly intentos: IntentosCitaManualService, private readonly registro: RegistroCitaManualService) {}

  /** El sobre separa clave estable de selección; ninguna identidad del cuerpo es autoridad. */
  @Post('manuales/intentos')
  @Header('Cache-Control', 'no-store')
  preparar(@CurrentUser() actor: JwtPayload, @Body() entrada: unknown) {
    if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada) ||
      Object.keys(entrada).length !== 2 || !Object.hasOwn(entrada, 'clave') || !Object.hasOwn(entrada, 'seleccion')) {
      throw new BadRequestException();
    }
    const datos = entrada as { clave: unknown; seleccion: unknown };
    return this.intentos.preparar(actor, datos.clave, datos.seleccion);
  }

  /** La decisión de creación/repetición procede del commit del escritor, no del navegador. */
  @Post('manuales/intentos/:clave/registrar')
  @Header('Cache-Control', 'no-store')
  async registrar(@CurrentUser() actor: JwtPayload, @Param('clave') clave: string,
    @Body() entrada: unknown, @Res({ passthrough: true }) respuesta: Response) {
    const registro = await this.registro.registrarConMeta(actor, clave, entrada);
    respuesta.status(registro.repetida ? 200 : 201);
    return registro.resultado;
  }

  /** Resolver requiere el mismo contenido para no cerrar ni recuperar otra operación por error. */
  @Post('manuales/intentos/:clave/resolver')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  resolver(@CurrentUser() actor: JwtPayload, @Param('clave') clave: string, @Body() entrada: unknown) {
    return this.registro.resolver(actor, clave, entrada);
  }

  @Get()
  @Header('Cache-Control', 'no-store')
  listar(@CurrentUser() actor: JwtPayload, @Query() query: unknown) { return this.agenda.listar(actor, query); }

  @Get(':id/historial')
  @Header('Cache-Control', 'no-store')
  historial(@CurrentUser() actor: JwtPayload, @Param('id') id: string, @Query() query: unknown) {
    return this.agenda.historial(actor, id, query);
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  detalle(@CurrentUser() actor: JwtPayload, @Param('id') id: string, @Query() query: unknown) {
    return this.agenda.detalle(actor, id, query);
  }
}
