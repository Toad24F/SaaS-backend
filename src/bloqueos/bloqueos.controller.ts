import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param,
  Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Rol } from '../auth/enums/rol.enum';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { BloqueosService } from './bloqueos.service';
import { BloqueoIdDto, ConsultarBloqueosDto, CrearBloqueoDto,
  EditarBloqueoDto } from './dto/bloqueos.dto';

/** La sesión identifica al actor; el servicio recupera negocio y propiedad actuales. */
@Controller('bloqueos')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Rol.ADMIN_NEGOCIO, Rol.PROFESIONAL)
export class BloqueosController {
  constructor(private readonly bloqueos: BloqueosService) {}

  @Get()
  listar(@Query() filtro: ConsultarBloqueosDto, @CurrentUser() actor: JwtPayload) {
    return this.bloqueos.listar(actor.sub, filtro);
  }

  @Post()
  crear(@Body() datos: CrearBloqueoDto, @CurrentUser() actor: JwtPayload) {
    return this.bloqueos.crear(actor.sub, datos);
  }

  @Patch(':id')
  editar(@Param() parametros: BloqueoIdDto, @Body() datos: EditarBloqueoDto,
    @CurrentUser() actor: JwtPayload) {
    return this.bloqueos.editar(actor.sub, parametros.id, datos);
  }

  @Delete(':id') @HttpCode(HttpStatus.NO_CONTENT)
  eliminar(@Param() parametros: BloqueoIdDto, @CurrentUser() actor: JwtPayload) {
    return this.bloqueos.eliminar(actor.sub, parametros.id);
  }
}
