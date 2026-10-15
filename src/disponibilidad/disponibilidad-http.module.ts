import { Module } from '@nestjs/common';
import { DisponibilidadModule } from './disponibilidad.module';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../auth/guards/roles.guard';
import { DisponibilidadController } from './disponibilidad.controller';

// Compone autenticación y dominio; las rutas no importan escritores de reservas.
@Module({ imports: [AuthModule, DisponibilidadModule],
  controllers: [DisponibilidadController], providers: [RolesGuard] })
export class DisponibilidadHttpModule {}
