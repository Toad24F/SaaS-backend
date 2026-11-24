import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { CortesReporteService } from './cortes-reporte.service';
import { CorteReporte } from './entities/corte-reporte.entity';
import { FilaCorteReporte } from './entities/fila-corte-reporte.entity';

/** Comparte el servicio de cortes entre HTTP y el ciclo periódico. */
@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([CorteReporte, FilaCorteReporte])],
  providers: [CortesReporteService],
  exports: [CortesReporteService],
})
export class ReportesModule {}
