import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RELOJ, RelojSistema } from '../comun/reloj';
import { LicenciasController } from './licencias.controller';
import { LicenciasModule } from './licencias.module';

// Compone rutas y autenticación sin introducir una dependencia circular en LicenciasModule.
@Module({
  imports: [AuthModule, LicenciasModule],
  controllers: [LicenciasController],
  providers: [RolesGuard, { provide: RELOJ, useClass: RelojSistema }],
})
export class LicenciasHttpModule {}
