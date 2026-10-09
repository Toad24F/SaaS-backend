import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Inject, Param, Patch,
  Post, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Rol } from '../auth/enums/rol.enum';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { SinCamposDto } from '../comun/dto/sin-campos.dto';
import { RELOJ, type Reloj } from '../comun/reloj';
import { AsignarSucursalesDto, CrearProfesionalDto, EditarProfesionalDto,
  CambiarAtencionSucursalDto, ProfesionalIdDto, ProfesionalSucursalIdDto,
  SeleccionarServiciosDto } from './dto/profesionales.dto';
import { ProfesionalesService } from './profesionales.service';

/** Gestión administrativa del perfil; la respuesta del servicio excluye secretos. */
@Controller('profesionales')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Rol.ADMIN_NEGOCIO)
export class ProfesionalesController {
  constructor(private readonly profesionales: ProfesionalesService,
    @Inject(RELOJ) private readonly reloj: Reloj) {}

  @Post()
  crear(@Body() datos: CrearProfesionalDto, @CurrentUser() actor: JwtPayload) {
    return this.profesionales.crear(actor.sub, datos, this.reloj.ahora());
  }

  @Get()
  listar(@CurrentUser() actor: JwtPayload) {
    return this.profesionales.listar(actor.sub);
  }

  @Get(':id')
  consultar(@Param() parametros: ProfesionalIdDto, @CurrentUser() actor: JwtPayload) {
    return this.profesionales.consultar(actor.sub, parametros.id);
  }

  @Patch(':id')
  editar(@Param() parametros: ProfesionalIdDto, @Body() datos: EditarProfesionalDto,
    @CurrentUser() actor: JwtPayload) {
    return this.profesionales.editar(actor.sub, parametros.id, datos, this.reloj.ahora());
  }

  @Post(':id/desactivar')
  @HttpCode(HttpStatus.NO_CONTENT)
  desactivar(@Param() parametros: ProfesionalIdDto, @Body() _datos: SinCamposDto,
    @CurrentUser() actor: JwtPayload) {
    return this.profesionales.cambiarEstado(actor.sub, parametros.id, false, this.reloj.ahora());
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  eliminar(@Param() parametros: ProfesionalIdDto, @CurrentUser() actor: JwtPayload) {
    // Perfil y cuenta solo salen juntos cuando no conservaron uso operativo.
    return this.profesionales.eliminar(actor.sub, parametros.id);
  }

  @Post(':id/reactivar')
  @HttpCode(HttpStatus.NO_CONTENT)
  reactivar(@Param() parametros: ProfesionalIdDto, @Body() _datos: SinCamposDto,
    @CurrentUser() actor: JwtPayload) {
    return this.profesionales.cambiarEstado(actor.sub, parametros.id, true, this.reloj.ahora());
  }

  @Get(':id/sucursales')
  listarSucursales(@Param() parametros: ProfesionalIdDto, @CurrentUser() actor: JwtPayload) {
    return this.profesionales.listarSucursales(actor.sub, parametros.id);
  }

  @Put(':id/sucursales')
  asignarSucursales(@Param() parametros: ProfesionalIdDto,
    @Body() datos: AsignarSucursalesDto, @CurrentUser() actor: JwtPayload) {
    // El conjunto completo se valida antes de quitar asignaciones previas.
    return this.profesionales.asignarSucursales(actor.sub, parametros.id, datos);
  }

  @Get(':id/servicios')
  @Roles(Rol.ADMIN_NEGOCIO, Rol.PROFESIONAL)
  listarServicios(@Param() parametros: ProfesionalIdDto, @CurrentUser() actor: JwtPayload) {
    return this.profesionales.listarServicios(actor.sub, parametros.id);
  }

  @Put(':id/servicios')
  @Roles(Rol.ADMIN_NEGOCIO, Rol.PROFESIONAL)
  seleccionarServicios(@Param() parametros: ProfesionalIdDto,
    @Body() datos: SeleccionarServiciosDto, @CurrentUser() actor: JwtPayload) {
    // La ruta acepta el conjunto completo, separado de asignaciones a sucursales.
    return this.profesionales.seleccionarServicios(actor.sub, parametros.id, datos);
  }

  @Get(':id/sucursales/:sucursalId/atencion')
  @Roles(Rol.ADMIN_NEGOCIO, Rol.PROFESIONAL)
  consultarAtencionSucursal(@Param() parametros: ProfesionalSucursalIdDto,
    @CurrentUser() actor: JwtPayload) {
    return this.profesionales.consultarAtencionSucursal(actor.sub,
      parametros.id, parametros.sucursalId);
  }

  @Put(':id/sucursales/:sucursalId/atencion')
  @Roles(Rol.ADMIN_NEGOCIO, Rol.PROFESIONAL)
  cambiarAtencionSucursal(@Param() parametros: ProfesionalSucursalIdDto,
    @Body() datos: CambiarAtencionSucursalDto, @CurrentUser() actor: JwtPayload) {
    // El reloj compartido fija el comienzo de la validación de recurrencias.
    return this.profesionales.cambiarAtencionSucursal(actor.sub, parametros.id,
      parametros.sucursalId, datos.activo, this.reloj.ahora().toISOString().slice(0, 10));
  }

  @Get(':id/sucursales/:sucursalId/servicios')
  @Roles(Rol.ADMIN_NEGOCIO, Rol.PROFESIONAL)
  listarServiciosSucursal(@Param() parametros: ProfesionalSucursalIdDto,
    @CurrentUser() actor: JwtPayload) {
    return this.profesionales.listarServiciosSucursal(actor.sub,
      parametros.id, parametros.sucursalId);
  }

  @Put(':id/sucursales/:sucursalId/servicios')
  @Roles(Rol.ADMIN_NEGOCIO, Rol.PROFESIONAL)
  seleccionarServiciosSucursal(@Param() parametros: ProfesionalSucursalIdDto,
    @Body() datos: SeleccionarServiciosDto, @CurrentUser() actor: JwtPayload) {
    // El reemplazo solo afecta a esta sucursal y conserva filas desactivadas.
    return this.profesionales.seleccionarServiciosSucursal(actor.sub,
      parametros.id, parametros.sucursalId, datos);
  }
}
