import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CortesReporteController } from './cortes-reporte.controller';
import { CortesReporteService } from './cortes-reporte.service';
import { CorteReporte } from './entities/corte-reporte.entity';
import { FilaCorteReporte } from './entities/fila-corte-reporte.entity';

/** Conecta la autenticación privada y la persistencia de cortes a la aplicación. */
@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([CorteReporte, FilaCorteReporte])],
  controllers: [CortesReporteController],
  providers: [CortesReporteService, RolesGuard],
})
export class ReportesHttpModule {}
