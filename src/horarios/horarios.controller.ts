import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Inject, Param,
  Put, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Rol } from '../auth/enums/rol.enum';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { RELOJ, type Reloj } from '../comun/reloj';
import { ProfesionalIdDto } from '../profesionales/dto/profesionales.dto';
import { ConsultarAtencionDto, FechaExcepcionDto, GuardarExcepcionDto, GuardarSemanaDto,
  RetirarExcepcionDto } from './dto/horarios.dto';
import { HorariosAccesoService } from './horarios-acceso.service';

/** Expone conjuntos completos; la fachada comprueba el dueño con datos persistidos. */
@Controller('profesionales')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Rol.ADMIN_NEGOCIO, Rol.PROFESIONAL)
export class HorariosController {
  constructor(private readonly acceso: HorariosAccesoService,
    @Inject(RELOJ) private readonly reloj: Reloj) {}

  private desde(): string { return this.reloj.ahora().toISOString().slice(0, 10); }

  @Get(':id/horario')
  consultarSemana(@Param() parametros: ProfesionalIdDto, @CurrentUser() actor: JwtPayload) {
    return this.acceso.consultarSemana(actor.sub, parametros.id);
  }

  @Get(':id/atencion')
  consultarAtencion(@Param() parametros: ProfesionalIdDto,
    @Query() consulta: ConsultarAtencionDto, @CurrentUser() actor: JwtPayload) {
    // La fachada comprueba la propiedad actual antes de proyectar intervalos.
    return this.acceso.consultarAtencion(actor.sub, parametros.id,
      consulta.desde, consulta.hasta);
  }

  @Put(':id/horario')
  guardarSemana(@Param() parametros: ProfesionalIdDto, @Body() datos: GuardarSemanaDto,
    @CurrentUser() actor: JwtPayload) {
    // Cada PUT reemplaza la semana entera, incluida una lista vacía.
    return this.acceso.guardarSemana(actor.sub, parametros.id, datos.franjas, this.desde());
  }

  @Get(':id/excepciones')
  consultarExcepciones(@Param() parametros: ProfesionalIdDto,
    @CurrentUser() actor: JwtPayload) {
    return this.acceso.consultarExcepciones(actor.sub, parametros.id);
  }

  @Put(':id/excepciones/:fecha')
  guardarExcepcion(@Param() parametros: FechaExcepcionDto,
    @Body() datos: GuardarExcepcionDto, @CurrentUser() actor: JwtPayload) {
    return this.acceso.guardarExcepcion(actor.sub, parametros.id, parametros.fecha,
      datos.sucursalId, datos.franjas, this.desde());
  }

  @Delete(':id/excepciones/:fecha')
  @HttpCode(HttpStatus.NO_CONTENT)
  retirarExcepcion(@Param() parametros: FechaExcepcionDto,
    @Query() consulta: RetirarExcepcionDto, @CurrentUser() actor: JwtPayload) {
    // Una fecha puede contener varias sucursales; la consulta elige una cabecera.
    return this.acceso.retirarExcepcion(actor.sub, parametros.id, parametros.fecha,
      consulta.sucursalId, this.desde());
  }
}
