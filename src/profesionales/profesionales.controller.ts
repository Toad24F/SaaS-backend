import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Param, Patch,
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
import { CuposUsuariosService } from '../usuarios/cupos-usuarios.service';

/** Gestión administrativa del perfil; la respuesta del servicio excluye secretos. */
@Controller('profesionales')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Rol.ADMIN_NEGOCIO)
export class ProfesionalesController {
  constructor(private readonly profesionales: ProfesionalesService,
    private readonly cuposUsuarios: CuposUsuariosService,
    @Inject(RELOJ) private readonly reloj: Reloj) {}

  @Post()
  crear(@Body() datos: CrearProfesionalDto, @CurrentUser() actor: JwtPayload) {
    return this.profesionales.crear(actor.sub, datos, this.reloj.ahora());
  }

  @Get()
  listar(@CurrentUser() actor: JwtPayload) {
    return this.profesionales.listar(actor.sub);
  }

  @Get('cupo')
  async consultarCupo(@CurrentUser() actor: JwtPayload) {
    // Solo el administrador del negocio autenticado consulta su cupo de Profesionales.
    return (await this.cuposUsuarios.consultar(actor.negocioId!)).profesionales;
  }

  // Rutas estáticas antes de :id para no tratarlas como identificadores.
  @Get('inhabilitados')
  listarInhabilitados(@CurrentUser() actor: JwtPayload) {
    return this.profesionales.listarInhabilitados(actor.sub);
  }

  @Get('inhabilitados/:id')
  consultarInhabilitado(@Param() parametros: ProfesionalIdDto, @CurrentUser() actor: JwtPayload) {
    return this.profesionales.consultarInhabilitado(actor.sub, parametros.id);
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

  @Post(':id/inhabilitar')
  @HttpCode(HttpStatus.OK)
  inhabilitar(@Param() parametros: ProfesionalIdDto, @Body() _datos: SinCamposDto,
    @CurrentUser() actor: JwtPayload) {
    return this.profesionales.inhabilitar(actor.sub, parametros.id, this.reloj.ahora());
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

  @Get(':id/oferta')
  @Roles(Rol.ADMIN_NEGOCIO, Rol.PROFESIONAL)
  consultarOferta(@Param() parametros: ProfesionalIdDto, @CurrentUser() actor: JwtPayload) {
    // La vista explica todos los niveles sin persistir un estado efectivo duplicado.
    return this.profesionales.consultarOferta(actor.sub, parametros.id);
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
