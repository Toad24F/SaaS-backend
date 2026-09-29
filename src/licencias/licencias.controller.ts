import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Param, Post, UseGuards } from '@nestjs/common';
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
import { ConsultaVigenciaLicenciasService } from './services/consulta-vigencia-licencias.service';

// Se exige una sesión vigente y rol superadmin incluso si el negocio destino está bloqueado.
@Controller('licencias')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Rol.SUPERADMIN)
export class LicenciasController {
  constructor(
    private readonly licencias: LicenciasService,
    private readonly consultaVigencia: ConsultaVigenciaLicenciasService,
    @Inject(RELOJ) private readonly reloj: Reloj,
  ) {}

  @Post(':id/suspender')
  @HttpCode(HttpStatus.OK)
  async suspender(@Param() parametros: LicenciaIdDto, @Body() _datos: SinCamposDto, @CurrentUser() actor: JwtPayload) {
    // Informa el plazo programado después de persistir la solicitud de suspensión.
    await this.licencias.suspender(actor.sub, parametros.id, this.reloj.ahora());
    return this.consultaVigencia.porId(parametros.id, this.reloj.ahora());
  }

  @Post(':id/reactivar')
  @HttpCode(HttpStatus.OK)
  async reactivar(@Param() parametros: LicenciaIdDto, @Body() _datos: SinCamposDto, @CurrentUser() actor: JwtPayload) {
    // Devuelve la vigencia efectiva tras reanudar, sin activar cuentas ni negocios.
    await this.licencias.reactivar(actor.sub, parametros.id, this.reloj.ahora());
    return this.consultaVigencia.porId(parametros.id, this.reloj.ahora());
  }

  @Post(':id/renovar')
  @HttpCode(HttpStatus.OK)
  async renovar(@Param() parametros: LicenciaIdDto, @Body() _datos: SinCamposDto, @CurrentUser() actor: JwtPayload) {
    // Cada solicitud suma un año calendario; la respuesta incluye el vencimiento resultante.
    await this.licencias.renovar(actor.sub, parametros.id, this.reloj.ahora());
    return this.consultaVigencia.porId(parametros.id, this.reloj.ahora());
  }

  @Get('mi-vigencia')
  @Roles(Rol.ADMIN_NEGOCIO, Rol.RECEPCIONISTA, Rol.PROFESIONAL)
  miVigencia(@CurrentUser() actor: JwtPayload) {
    // El negocio se deriva del JWT validado, nunca de un parámetro del cliente.
    return this.consultaVigencia.propia(actor.negocioId!, this.reloj.ahora());
  }

  @Get(':id/vigencia')
  @Roles(Rol.SUPERADMIN)
  vigenciaPorId(@Param() parametros: LicenciaIdDto) {
    // Solo superadmin consulta un negocio bloqueado usando su licencia por ID.
    return this.consultaVigencia.porId(parametros.id, this.reloj.ahora());
  }
}
