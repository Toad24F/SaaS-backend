import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { AutorizacionService } from '../auth/services/autorizacion.service';
import { RELOJ, RelojSistema } from '../comun/reloj';
import { PersonalizacionPortal } from './entities/personalizacion-portal.entity';
import { RecursoPortal } from './entities/recurso-portal.entity';
import { PersonalizacionPortalService } from './personalizacion-portal.service';

// Comparte el dominio de marca entre las rutas y el ejecutor de limpieza.
@Module({
  imports: [TypeOrmModule.forFeature([PersonalizacionPortal, RecursoPortal]), AuditoriaModule],
  providers: [PersonalizacionPortalService, AutorizacionService, { provide: RELOJ, useClass: RelojSistema }],
  exports: [PersonalizacionPortalService],
})
export class PersonalizacionPortalModule {}
