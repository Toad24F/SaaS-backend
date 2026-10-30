import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Inject, Param, Post, UseGuards } from '@nestjs/common';
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
import { SolicitarSuspensionDto, validarClaveOperacionLicencia } from './dto/operacion-licencia.dto';
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
  async suspender(@Param() parametros: LicenciaIdDto, @Body() datos: SolicitarSuspensionDto,
    @Headers('idempotency-key') clave: string | undefined, @CurrentUser() actor: JwtPayload) {
    // La clave se exige en HTTP; el servicio la comprueba otra vez antes de la transacción.
    const resultado = await this.licencias.suspender(actor.sub, parametros.id,
      this.reloj.ahora(), validarClaveOperacionLicencia(clave), datos.plazoDias);
    return resultado.vista;
  }

  @Post(':id/reactivar')
  @HttpCode(HttpStatus.OK)
  async reactivar(@Param() parametros: LicenciaIdDto, @Body() _datos: SinCamposDto,
    @Headers('idempotency-key') clave: string | undefined, @CurrentUser() actor: JwtPayload) {
    // Repetir la clave devuelve la vista guardada, sin consultar un estado posterior.
    const resultado = await this.licencias.reactivar(actor.sub, parametros.id,
      this.reloj.ahora(), validarClaveOperacionLicencia(clave));
    return resultado.vista;
  }

  @Post(':id/renovar')
  @HttpCode(HttpStatus.OK)
  async renovar(@Param() parametros: LicenciaIdDto, @Body() _datos: SinCamposDto,
    @Headers('idempotency-key') clave: string | undefined, @CurrentUser() actor: JwtPayload) {
    // Solo una clave nueva inicia otra anualidad; la repetida conserva el cuerpo original.
    const resultado = await this.licencias.renovar(actor.sub, parametros.id,
      this.reloj.ahora(), validarClaveOperacionLicencia(clave));
    return resultado.vista;
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
