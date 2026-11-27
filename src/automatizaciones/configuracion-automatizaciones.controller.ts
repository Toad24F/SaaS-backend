import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Rol } from '../auth/enums/rol.enum';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ConfiguracionAutomatizacionesService } from './configuracion-automatizaciones.service';

/** Ambas operaciones usan el administrador de la sesión para resolver el negocio. */
@Controller('negocio/automatizaciones')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Rol.ADMIN_NEGOCIO)
export class ConfiguracionAutomatizacionesController {
  constructor(private readonly configuracion: ConfiguracionAutomatizacionesService) {}

  @Get()
  consultar(@CurrentUser('sub') actorId: number) {
    return this.configuracion.consultar(actorId);
  }

  @Put()
  guardar(@CurrentUser('sub') actorId: number, @Body() entrada: unknown) {
    return this.configuracion.guardar(actorId, entrada);
  }
}
