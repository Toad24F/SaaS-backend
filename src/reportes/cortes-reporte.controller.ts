import { Body, Controller, Header, Post, UseGuards } from '@nestjs/common';
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
  async crear(@CurrentUser('sub') actorId: number, @Body() entrada: unknown) {
    try {
      // Esperar el commit antes de devolver la referencia y sanitizar fallos de persistencia.
      return await this.cortes.crear(actorId, entrada);
    } catch (error) {
      throw normalizarErrorOperativo(error);
    }
  }
}
