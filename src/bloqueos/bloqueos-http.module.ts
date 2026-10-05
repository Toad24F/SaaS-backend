import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../auth/guards/roles.guard';
import { BloqueosController } from './bloqueos.controller';
import { BloqueosModule } from './bloqueos.module';

// Mantiene HTTP separado de persistencia para evitar ciclos entre dominios.
@Module({ imports: [AuthModule, BloqueosModule], controllers: [BloqueosController],
  providers: [RolesGuard] })
export class BloqueosHttpModule {}
