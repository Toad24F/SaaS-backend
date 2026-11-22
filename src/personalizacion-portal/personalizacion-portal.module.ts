import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AutorizacionService } from '../auth/services/autorizacion.service';
import { RELOJ, RelojSistema } from '../comun/reloj';
import { PersonalizacionPortal } from './entities/personalizacion-portal.entity';
import { RecursoPortal } from './entities/recurso-portal.entity';
import { PersonalizacionPortalService } from './personalizacion-portal.service';

// Registra las entidades en el servidor y expone el servicio para su consumo posterior.
@Module({
  imports: [TypeOrmModule.forFeature([PersonalizacionPortal, RecursoPortal])],
  providers: [PersonalizacionPortalService, AutorizacionService, { provide: RELOJ, useClass: RelojSistema }],
  exports: [PersonalizacionPortalService],
})
export class PersonalizacionPortalModule {}
