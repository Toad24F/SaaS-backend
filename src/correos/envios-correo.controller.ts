import { Body, Controller, Get, Param, Post, HttpCode, UseGuards } from '@nestjs/common';
import { ValidateBy } from 'class-validator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Rol } from '../auth/enums/rol.enum';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { NegocioIdDto } from '../negocios/dto/negocios-http.dto';
import { ProcesadorCorreoService } from './procesador-correo.service';

export class ReintentarEnvioDto {
  // BIGINT se conserva como cadena; no pasa por Number ni pierde precisión.
  @ValidateBy({
    name: 'idEnvio', validator: {
      validate: (valor: unknown) => typeof valor === 'string' && /^[1-9]\d{0,19}$/.test(valor) &&
        BigInt(valor) <= 18446744073709551615n,
      defaultMessage: () => 'envioId debe ser una cadena de entero positivo válida.',
    }
  })
  envioId: string;
}

/** Las rutas muestran estado, nunca un código ni el mensaje de entrega. */
@Controller('negocios')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Rol.SUPERADMIN)
export class EnviosCorreoController {
  constructor(private readonly procesador: ProcesadorCorreoService) { }

  @Get(':id/envios')//muestra los envíos de correo pendientes y procesados para un negocio específico
  listar(@Param() parametros: NegocioIdDto, @CurrentUser() actor: JwtPayload) {
    return this.procesador.listar(parametros.id, actor.sub);
  }

  @Post(':id/reintentar-envio')//reintenta un envío de correo específico para un negocio, solo si el actor es un superadministrador activo y el negocio existe
  @HttpCode(200)
  reintentar(@Param() parametros: NegocioIdDto, @Body() datos: ReintentarEnvioDto,
    @CurrentUser() actor: JwtPayload) {
    return this.procesador.reintentar(parametros.id, datos.envioId, actor.sub);
  }
}
