import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Rol } from '../auth/enums/rol.enum';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { SinCamposDto } from '../comun/dto/sin-campos.dto';
import { RELOJ, type Reloj } from '../comun/reloj';
import { CrearServicioDto, EditarServicioDto } from './dto/servicio.dto';
import { ServicioIdDto } from './dto/servicio-id.dto';
import { Servicio } from './entities/servicio.entity';
import { ServiciosService } from './servicios.service';

/** API del catálogo: el actor determina negocio y el servicio comprueba pertenencia. */
@Controller('servicios')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Rol.ADMIN_NEGOCIO)
export class ServiciosController {
  constructor(private readonly servicios: ServiciosService,
    @Inject(RELOJ) private readonly reloj: Reloj) {}

  @Post()
  @Roles(Rol.ADMIN_NEGOCIO, Rol.PROFESIONAL)
  async crear(@Body() datos: CrearServicioDto, @CurrentUser() actor: JwtPayload) {
    return this.presentar(await this.servicios.crear(actor.sub, datos));
  }

  @Get()
  @Roles(Rol.ADMIN_NEGOCIO, Rol.PROFESIONAL)
  async listar(@CurrentUser() actor: JwtPayload) {
    return (await this.servicios.listar(actor.sub)).map((servicio) => this.presentar(servicio));
  }

  // Mantener las rutas estáticas antes de :id.
  @Get('inhabilitados')
  async listarInhabilitados(@CurrentUser() actor: JwtPayload) {
    return (await this.servicios.listarInhabilitados(actor.sub)).map((fila) => this.presentar(fila));
  }

  @Get('inhabilitados/:id')
  async consultarInhabilitado(@Param() parametros: ServicioIdDto,
    @CurrentUser() actor: JwtPayload) {
    return this.presentar(await this.servicios.consultarInhabilitado(actor.sub, parametros.id));
  }

  @Get(':id')
  @Roles(Rol.ADMIN_NEGOCIO, Rol.PROFESIONAL)
  async consultar(@Param() parametros: ServicioIdDto, @CurrentUser() actor: JwtPayload) {
    return this.presentar(await this.servicios.consultar(actor.sub, parametros.id));
  }

  @Patch(':id')
  @Roles(Rol.ADMIN_NEGOCIO, Rol.PROFESIONAL)
  async editar(@Param() parametros: ServicioIdDto, @Body() datos: EditarServicioDto,
    @CurrentUser() actor: JwtPayload) {
    return this.presentar(await this.servicios.editar(actor.sub, parametros.id, datos));
  }

  @Post(':id/desactivar')
  @HttpCode(HttpStatus.NO_CONTENT)
  desactivar(@Param() parametros: ServicioIdDto, @Body() _datos: SinCamposDto,
    @CurrentUser() actor: JwtPayload) {
    return this.servicios.cambiarEstado(actor.sub, parametros.id, false);
  }

  @Post(':id/inhabilitar')
  @HttpCode(HttpStatus.OK)
  async inhabilitar(@Param() parametros: ServicioIdDto, @Body() _datos: SinCamposDto,
    @CurrentUser() actor: JwtPayload) {
    return this.presentar(await this.servicios.inhabilitar(actor.sub, parametros.id,
      this.reloj.ahora()));
  }

  @Post(':id/restaurar')
  @HttpCode(HttpStatus.OK)
  async restaurar(@Param() parametros: ServicioIdDto, @Body() _datos: SinCamposDto,
    @CurrentUser() actor: JwtPayload) {
    // La activación sigue siendo un comando distinto con sus validaciones vigentes.
    return this.presentar(await this.servicios.restaurar(actor.sub, parametros.id));
  }

  @Post(':id/reactivar')
  @HttpCode(HttpStatus.NO_CONTENT)
  reactivar(@Param() parametros: ServicioIdDto, @Body() _datos: SinCamposDto,
    @CurrentUser() actor: JwtPayload) {
    return this.servicios.cambiarEstado(actor.sub, parametros.id, true);
  }

  private presentar(servicio: Servicio) {
    // Proyección explícita: expone autoría estable sin la identidad privada del autor.
    return { id: servicio.id, negocioId: servicio.negocioId, nombre: servicio.nombre,
      costo: servicio.costo, duracionMinutos: servicio.duracionMinutos,
      activo: servicio.activo, inhabilitadoEn: servicio.inhabilitadoEn,
      creadoEn: servicio.creadoEn,
      descripcion: servicio.descripcion ?? null,
      creadorPersonalId: servicio.creadorPersonalId ?? null };
  }
}
