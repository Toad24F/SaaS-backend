import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SucursalesController } from './sucursales.controller';
import { SucursalesModule } from './sucursales.module';

// La capa HTTP depende del dominio y Auth; el dominio permanece sin ciclo.
@Module({ imports: [AuthModule, SucursalesModule], controllers: [SucursalesController],
  providers: [RolesGuard] })
export class SucursalesHttpModule {}
