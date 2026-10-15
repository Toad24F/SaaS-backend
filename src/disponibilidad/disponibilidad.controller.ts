import { Body, Controller, Get, Put, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Rol } from '../auth/enums/rol.enum';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { ConfiguracionAgendaService } from './configuracion-agenda.service';
import { MotorDisponibilidadService } from './motor-disponibilidad.service';
import { validarConsultaDisponibilidad } from './disponibilidad-entradas';

/** Superficie privada: "publica" indica reglas de agenda, no acceso anónimo. */
@Controller('disponibilidad')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Rol.ADMIN_NEGOCIO, Rol.RECEPCIONISTA, Rol.PROFESIONAL)
export class DisponibilidadController {
  constructor(private readonly configuracion: ConfiguracionAgendaService,
    private readonly motor: MotorDisponibilidadService) {}

  @Get('configuracion')
  @Roles(Rol.ADMIN_NEGOCIO)
  consultarConfiguracion(@CurrentUser() actor: JwtPayload) {
    return this.configuracion.consultar(actor.sub);
  }

  @Put('configuracion')
  @Roles(Rol.ADMIN_NEGOCIO)
  guardarConfiguracion(@CurrentUser() actor: JwtPayload, @Body() datos: unknown) {
    // El servicio valida el conjunto íntegro antes de la transacción y audita el cambio.
    return this.configuracion.guardar(actor.sub, datos);
  }

  @Get()
  consultar(@CurrentUser() actor: JwtPayload, @Query() entrada: unknown) {
    const datos = validarConsultaDisponibilidad(entrada);
    // El motor vuelve a comprobar sesión, licencia, negocio y perfil en su instantánea.
    return this.motor.consultar(actor, datos.personalId, datos.sucursalId,
      datos.servicioId, datos.desde, datos.hasta, datos.modalidad);
  }
}
