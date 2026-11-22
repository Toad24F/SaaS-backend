import { type ArgumentsHost, BadRequestException, Body, type CallHandler, Catch, Controller,
  type ExceptionFilter, type ExecutionContext, Get, HttpCode, Logger, PayloadTooLargeException,
  Post, Put, UploadedFile, UseFilters, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { QueryFailedError } from 'typeorm';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Rol } from '../auth/enums/rol.enum';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { MAX_BYTES_LOGO } from './logo-portal';
import { leerVersionPortal } from './personalizacion-portal.entradas';
import { PersonalizacionPortalService } from './personalizacion-portal.service';

class ArchivoLogoInterceptor extends FileInterceptor('archivo', {
  // Busboy corta al alcanzar el límite. El byte adicional acepta 2 MiB exactos.
  limits: { fileSize: MAX_BYTES_LOGO + 1, files: 1, fields: 1, parts: 3, fieldSize: 32 },
}) {
  override async intercept(contexto: ExecutionContext, siguiente: CallHandler) {
    try { return await super.intercept(contexto, siguiente); }
    catch (error) {
      if (error instanceof PayloadTooLargeException) throw new BadRequestException('El logo debe pesar como máximo 2 MiB.');
      throw error;
    }
  }
}

@Catch(QueryFailedError)
class ErrorPersistenciaMarca implements ExceptionFilter<QueryFailedError> {
  private readonly logger = new Logger(PersonalizacionPortalController.name);

  catch(_error: QueryFailedError, host: ArgumentsHost) {
    // La excepción de TypeORM puede contener el binario del logo en sus parámetros.
    this.logger.error('No se pudo completar una operación de persistencia de marca.');
    host.switchToHttp().getResponse<Response>().status(500).json({
      statusCode: 500, message: 'No se pudo completar la personalización.',
    });
  }
}

/** Rutas administrativas de marca. El servicio vuelve a verificar la cuenta persistida. */
@Controller('negocio/personalizacion')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Rol.ADMIN_NEGOCIO)
@UseFilters(ErrorPersistenciaMarca)
export class PersonalizacionPortalController {
  constructor(private readonly personalizacion: PersonalizacionPortalService) {}

  @Get()
  consultar(@CurrentUser('sub') actorId: number) {
    return this.personalizacion.consultar(actorId);
  }

  @Post('logos')
  @UseInterceptors(ArchivoLogoInterceptor)
  cargar(@CurrentUser('sub') actorId: number, @Body() entrada: unknown,
    @UploadedFile() archivo?: { buffer: Buffer; mimetype: string }) {
    if (!archivo) throw new BadRequestException('Adjunta un archivo de logo.');
    return this.personalizacion.guardarLogoProvisional(actorId, leerVersionPortal(entrada, true), archivo.buffer, archivo.mimetype);
  }

  @Put()
  publicar(@CurrentUser('sub') actorId: number, @Body() entrada: unknown) {
    return this.personalizacion.publicar(actorId, entrada);
  }

  @Post('restaurar')
  @HttpCode(200)
  restaurar(@CurrentUser('sub') actorId: number, @Body() entrada: unknown) {
    return this.personalizacion.restaurar(actorId, entrada);
  }
}
