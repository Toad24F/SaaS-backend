import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Rol } from '../auth/enums/rol.enum';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { SinCamposDto } from '../comun/dto/sin-campos.dto';
import { CrearSucursalDto, EditarSucursalDto } from './dto/sucursal.dto';
import { SucursalIdDto } from './dto/sucursal-id.dto';
import { Sucursal } from './entities/sucursal.entity';
import { SucursalesService } from './sucursales.service';

/** CRUD inicial propio del administrador; el negocio nunca se toma del cuerpo. */
@Controller('sucursales')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Rol.ADMIN_NEGOCIO)
export class SucursalesController {
  constructor(private readonly sucursales: SucursalesService) {}

  @Post()
  async crear(@Body() datos: CrearSucursalDto, @CurrentUser() actor: JwtPayload) {
    return this.presentar(await this.sucursales.crear(actor.sub, datos));
  }

  @Get()
  async listar(@CurrentUser() actor: JwtPayload) {
    return (await this.sucursales.listar(actor.sub)).map((sucursal) => this.presentar(sucursal));
  }

  @Get('cupo')
  consultarCupo(@CurrentUser() actor: JwtPayload) {
    return this.sucursales.consultarCupo(actor.sub);
  }

  @Get(':id')
  async consultar(@Param() parametros: SucursalIdDto, @CurrentUser() actor: JwtPayload) {
    return this.presentar(await this.sucursales.consultar(actor.sub, parametros.id));
  }

  @Patch(':id')
  async editar(@Param() parametros: SucursalIdDto, @Body() datos: EditarSucursalDto,
    @CurrentUser() actor: JwtPayload) {
    return this.presentar(await this.sucursales.editar(actor.sub, parametros.id, datos));
  }

  @Post(':id/desactivar')
  @HttpCode(HttpStatus.NO_CONTENT)
  desactivar(@Param() parametros: SucursalIdDto, @Body() _datos: SinCamposDto,
    @CurrentUser() actor: JwtPayload) {
    return this.sucursales.desactivar(actor.sub, parametros.id);
  }

  private presentar(sucursal: Sucursal) {
    // Lista permitida: relaciones y columnas nuevas no pasan inadvertidas al HTTP.
    return { id: sucursal.id, negocioId: sucursal.negocioId, nombre: sucursal.nombre,
      direccion: sucursal.direccion, telefono: sucursal.telefono,
      zonaHoraria: sucursal.zonaHoraria, urlGoogleMaps: sucursal.urlGoogleMaps,
      notasLlegada: sucursal.notasLlegada, activo: sucursal.activo,
      creadoEn: sucursal.creadoEn };
  }
}
