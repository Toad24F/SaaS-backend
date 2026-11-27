import { Body, Controller, Get, Header, HttpException, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Rol } from '../auth/enums/rol.enum';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { normalizarErrorOperativo } from '../citas/errores-operativos';
import { CortesReporteService } from './cortes-reporte.service';

@Controller('reportes/cortes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Rol.ADMIN_NEGOCIO)
export class CortesReporteController {
  constructor(private readonly cortes: CortesReporteService) {}

  @Post()
  @Header('Cache-Control', 'no-store')
  crear(@CurrentUser('sub') actorId: number, @Body() entrada: unknown) {
    return this.responder(() => this.cortes.crear(actorId, entrada));
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  resumen(@CurrentUser('sub') actorId: number, @Param('id') id: string) {
    return this.responder(() => this.cortes.obtenerResumen(actorId, id));
  }

  @Get(':id/filas')
  @Header('Cache-Control', 'no-store')
  filas(@CurrentUser('sub') actorId: number, @Param('id') id: string, @Query() query: unknown) {
    return this.responder(() => this.cortes.obtenerPagina(actorId, id, query));
  }

  private async responder<T>(operacion: () => Promise<T>): Promise<T> {
    try {
      // Esperar la transacción completa antes de entregar el corte, el resumen o una página.
      return await operacion();
    } catch (error) {
      const seguro = normalizarErrorOperativo(error);
      const estado = seguro.getStatus();
      if (estado >= 500) {
        // El fallo se comunica sin cifras parciales, trazas ni detalles de persistencia.
        throw new HttpException('No se pudo completar el reporte. Reintente o acote el periodo.', estado);
      }
      throw seguro;
    }
  }
}
