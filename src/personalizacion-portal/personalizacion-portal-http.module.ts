import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PersonalizacionPortalController } from './personalizacion-portal.controller';
import { PersonalizacionPortalModule } from './personalizacion-portal.module';

// Las lecturas públicas importan el dominio sin incorporar controladores privados.
@Module({
  imports: [AuthModule, PersonalizacionPortalModule, MulterModule.register()],
  controllers: [PersonalizacionPortalController],
  providers: [RolesGuard],
})
export class PersonalizacionPortalHttpModule {}
