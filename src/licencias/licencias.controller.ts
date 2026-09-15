import { Body, Controller, HttpCode, HttpStatus, Inject, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Rol } from '../auth/enums/rol.enum';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { SinCamposDto } from '../comun/dto/sin-campos.dto';
import { RELOJ } from '../comun/reloj';
import type { Reloj } from '../comun/reloj';
import { LicenciaIdDto } from './dto/licencia-id.dto';
import { LicenciasService } from './licencias.service';

// Se exige una sesión vigente y rol superadmin incluso si el negocio destino está bloqueado.
@Controller('licencias')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Rol.SUPERADMIN)
export class LicenciasController {
  constructor(
    private readonly licencias: LicenciasService,
    @Inject(RELOJ) private readonly reloj: Reloj,
  ) {}

  @Post(':id/suspender')
  @HttpCode(HttpStatus.NO_CONTENT)
  suspender(@Param() parametros: LicenciaIdDto, @Body() _datos: SinCamposDto, @CurrentUser() actor: JwtPayload): Promise<void> {
    // El servicio congela el tiempo una sola vez y audita dentro de su transacción.
    return this.licencias.suspender(actor.sub, parametros.id, this.reloj.ahora());
  }

  @Post(':id/reactivar')
  @HttpCode(HttpStatus.NO_CONTENT)
  reactivar(@Param() parametros: LicenciaIdDto, @Body() _datos: SinCamposDto, @CurrentUser() actor: JwtPayload): Promise<void> {
    // Solo retira la suspensión y devuelve el tiempo; no activa cuentas ni negocios.
    return this.licencias.reactivar(actor.sub, parametros.id, this.reloj.ahora());
  }

  @Post(':id/renovar')
  @HttpCode(HttpStatus.NO_CONTENT)
  renovar(@Param() parametros: LicenciaIdDto, @Body() _datos: SinCamposDto, @CurrentUser() actor: JwtPayload): Promise<void> {
    // Cada solicitud suma un año calendario. El cuerpo no admite período ni fechas.
    return this.licencias.renovar(actor.sub, parametros.id, this.reloj.ahora());
  }
}
