import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ConfiguracionAutomatizacionesController } from './configuracion-automatizaciones.controller';
import { ConfiguracionAutomatizacionesService } from './configuracion-automatizaciones.service';
import { ConfiguracionAutomatizaciones } from './entities/configuracion-automatizaciones.entity';

/** Registra la configuración en la conexión de la aplicación y la expone por HTTP. */
@Module({
  imports: [AuthModule, AuditoriaModule, TypeOrmModule.forFeature([ConfiguracionAutomatizaciones])],
  controllers: [ConfiguracionAutomatizacionesController],
  providers: [ConfiguracionAutomatizacionesService, RolesGuard],
})
export class ConfiguracionAutomatizacionesHttpModule {}
