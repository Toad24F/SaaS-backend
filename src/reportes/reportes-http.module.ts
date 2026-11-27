import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CortesReporteController } from './cortes-reporte.controller';
import { ReportesModule } from './reportes.module';

/** Registra las rutas privadas de reportes con los permisos de Administración. */
@Module({
  imports: [AuthModule, ReportesModule],
  controllers: [CortesReporteController],
  providers: [RolesGuard],
})
export class ReportesHttpModule {}
