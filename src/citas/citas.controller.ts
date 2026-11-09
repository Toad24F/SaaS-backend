import { Controller, Get, Header, Param, Query, UseFilters, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { ConsultaAgendaService } from './consulta-agenda.service';
import { ErroresOperativosFilter } from './errores-operativos.filter';

/** El guard autentica la sesión; cada caso de uso relee permisos y pertenencia en servidor. */
@Controller('citas')
@UseGuards(JwtAuthGuard)
@UseFilters(ErroresOperativosFilter)
export class CitasController {
  constructor(private readonly agenda: ConsultaAgendaService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  listar(@CurrentUser() actor: JwtPayload, @Query() query: unknown) { return this.agenda.listar(actor, query); }

  @Get(':id/historial')
  @Header('Cache-Control', 'no-store')
  historial(@CurrentUser() actor: JwtPayload, @Param('id') id: string, @Query() query: unknown) {
    return this.agenda.historial(actor, id, query);
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  detalle(@CurrentUser() actor: JwtPayload, @Param('id') id: string, @Query() query: unknown) {
    return this.agenda.detalle(actor, id, query);
  }
}
