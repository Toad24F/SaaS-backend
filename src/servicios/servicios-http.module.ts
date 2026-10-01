import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ServiciosController } from './servicios.controller';
import { ServiciosModule } from './servicios.module';

// Separa las rutas autenticadas del dominio para evitar dependencias circulares.
@Module({ imports: [AuthModule, ServiciosModule], controllers: [ServiciosController],
  providers: [RolesGuard] })
export class ServiciosHttpModule {}
