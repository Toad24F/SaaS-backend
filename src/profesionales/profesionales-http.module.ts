import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ProfesionalesController } from './profesionales.controller';
import { ProfesionalesModule } from './profesionales.module';

// Composición HTTP separada del dominio para mantener imports acíclicos.
@Module({ imports: [AuthModule, ProfesionalesModule],
  controllers: [ProfesionalesController], providers: [RolesGuard] })
export class ProfesionalesHttpModule {}
