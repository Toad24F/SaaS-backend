import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Rol } from '../auth/enums/rol.enum';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { SinCamposDto } from '../comun/dto/sin-campos.dto';
import { CrearServicioDto, EditarServicioDto } from './dto/servicio.dto';
import { ServicioIdDto } from './dto/servicio-id.dto';
import { Servicio } from './entities/servicio.entity';
import { ServiciosService } from './servicios.service';

/** API del catálogo: el actor determina negocio y el servicio comprueba pertenencia. */
@Controller('servicios')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Rol.ADMIN_NEGOCIO)
export class ServiciosController {
  constructor(private readonly servicios: ServiciosService) {}

  @Post()
  async crear(@Body() datos: CrearServicioDto, @CurrentUser() actor: JwtPayload) {
    return this.presentar(await this.servicios.crear(actor.sub, datos));
  }

  @Get()
  async listar(@CurrentUser() actor: JwtPayload) {
    return (await this.servicios.listar(actor.sub)).map((servicio) => this.presentar(servicio));
  }

  @Get(':id')
  async consultar(@Param() parametros: ServicioIdDto, @CurrentUser() actor: JwtPayload) {
    return this.presentar(await this.servicios.consultar(actor.sub, parametros.id));
  }

  @Patch(':id')
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

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  eliminar(@Param() parametros: ServicioIdDto, @CurrentUser() actor: JwtPayload) {
    // Un servicio elegido o con actividad posterior al alta permanece consultable.
    return this.servicios.eliminar(actor.sub, parametros.id);
  }

  @Post(':id/reactivar')
  @HttpCode(HttpStatus.NO_CONTENT)
  reactivar(@Param() parametros: ServicioIdDto, @Body() _datos: SinCamposDto,
    @CurrentUser() actor: JwtPayload) {
    return this.servicios.cambiarEstado(actor.sub, parametros.id, true);
  }

  private presentar(servicio: Servicio) {
    // Proyección explícita: ninguna relación futura altera el contrato HTTP.
    return { id: servicio.id, negocioId: servicio.negocioId, nombre: servicio.nombre,
      costo: servicio.costo, duracionMinutos: servicio.duracionMinutos,
      activo: servicio.activo, creadoEn: servicio.creadoEn };
  }
}
