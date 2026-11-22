import { Body, Controller, Get, Header, Param, Patch, Post, Query, Res, UseFilters, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { ErroresOperativosFilter } from '../citas/errores-operativos.filter';
import { ClientesService } from './clientes.service';

/** Autenticación privada y errores seguros; el servicio reconstruye permiso, negocio y licencia.
 * Cada respuesta personal evita caché, incluidos rechazos capturados por el filtro operativo.
 */
@Controller('clientes')
@UseGuards(JwtAuthGuard)
@UseFilters(ErroresOperativosFilter)
export class ClientesController {
  constructor(private readonly clientes: ClientesService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  listar(@CurrentUser() actor: JwtPayload, @Query() query: unknown) {
    return this.clientes.listar(actor, query);
  }

  @Get(':id/citas')
  @Header('Cache-Control', 'no-store')
  historial(@CurrentUser() actor: JwtPayload, @Param('id') id: string, @Query() query: unknown) {
    return this.clientes.historialCitas(actor, id, query);
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  consultar(@CurrentUser() actor: JwtPayload, @Param('id') id: string, @Query() query: unknown) {
    return this.clientes.consultar(actor, id, query);
  }

  // Una coincidencia devuelve la ficha activa con la misma proyección que un alta nueva.
  @Post()
  @Header('Cache-Control', 'no-store')
  async crear(@CurrentUser() actor: JwtPayload, @Body() body: unknown, @Res({ passthrough: true }) respuesta: Response) {
    const { ficha, creada } = await this.clientes.crearConMeta(actor, body);
    respuesta.status(creada ? 201 : 200);
    return ficha;
  }

  // La versión observada viaja en el cuerpo; el servicio evita sobrescribir otra corrección.
  @Patch(':id')
  @Header('Cache-Control', 'no-store')
  corregir(@CurrentUser() actor: JwtPayload, @Param('id') id: string, @Body() body: unknown) {
    return this.clientes.corregir(actor, id, body);
  }
}
