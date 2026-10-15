import { Body, Controller, Get, HttpCode, HttpException, InternalServerErrorException,
  Post, Put, Query, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Rol } from '../auth/enums/rol.enum';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { ConfiguracionAgendaService } from './configuracion-agenda.service';
import { MotorDisponibilidadService } from './motor-disponibilidad.service';
import { validarConsultaDisponibilidad, validarInicioPuntual } from './disponibilidad-entradas';

const CODIGOS_TEMPORALES = new Set(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT',
  'PROTOCOL_CONNECTION_LOST', 'ER_CON_COUNT_ERROR', 'ER_LOCK_WAIT_TIMEOUT',
  'ER_LOCK_DEADLOCK']);

/** Conserva los errores de contrato y oculta detalles de SQL o del cálculo. */
function relanzarErrorConsulta(error: unknown): never {
  if (error instanceof HttpException) throw error;
  const datos = error as { code?: unknown; driverError?: { code?: unknown } } | null;
  const codigo = error instanceof QueryFailedError ? datos?.driverError?.code : datos?.code;
  if (typeof codigo === 'string' && CODIGOS_TEMPORALES.has(codigo)) {
    throw new ServiceUnavailableException('No se pudo comprobar la disponibilidad. Reintente.');
  }
  throw new InternalServerErrorException('No se pudo comprobar la disponibilidad. Reintente.');
}

/** Superficie privada: "publica" indica reglas de agenda, no acceso anónimo. */
@Controller('disponibilidad')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Rol.ADMIN_NEGOCIO, Rol.RECEPCIONISTA, Rol.PROFESIONAL)
export class DisponibilidadController {
  constructor(private readonly configuracion: ConfiguracionAgendaService,
    private readonly motor: MotorDisponibilidadService) {}

  @Get('configuracion')
  @Roles(Rol.ADMIN_NEGOCIO)
  async consultarConfiguracion(@CurrentUser() actor: JwtPayload) {
    try { return await this.configuracion.consultar(actor.sub); }
    catch (error) { relanzarErrorConsulta(error); }
  }

  @Put('configuracion')
  @Roles(Rol.ADMIN_NEGOCIO)
  async guardarConfiguracion(@CurrentUser() actor: JwtPayload, @Body() datos: unknown) {
    // El servicio valida el conjunto íntegro antes de la transacción y audita el cambio.
    try { return await this.configuracion.guardar(actor.sub, datos); }
    catch (error) { relanzarErrorConsulta(error); }
  }

  @Get()
  async consultar(@CurrentUser() actor: JwtPayload, @Query() entrada: unknown) {
    try {
      const datos = validarConsultaDisponibilidad(entrada);
      // El motor vuelve a comprobar sesión, licencia, negocio y perfil en su instantánea.
      return await this.motor.consultar(actor, datos.personalId, datos.sucursalId,
        datos.servicioId, datos.desde, datos.hasta, datos.modalidad);
    } catch (error) { relanzarErrorConsulta(error); }
  }

  @Post('validar')
  @HttpCode(200)
  async validar(@CurrentUser() actor: JwtPayload, @Body() entrada: unknown) {
    try {
      const datos = validarInicioPuntual(entrada);
      // La zona y la oferta se obtienen dentro de la lectura autorizada del motor.
      // Este endpoint solo responde; no inserta citas ni apartados.
      return await this.motor.validar(actor, datos.personalId, datos.sucursalId,
        datos.servicioId, datos.fechaLocal, datos.horaInicio, datos.modalidad);
    } catch (error) { relanzarErrorConsulta(error); }
  }
}
