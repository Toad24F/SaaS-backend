import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { Licencia } from './entities/licencia.entity';
import { CalendarioLicenciasService } from './services/calendario-licencias.service';
import { PoliticaAccesoLicenciaService } from './services/politica-acceso-licencia.service';

// Las operaciones posteriores reutilizarán este repositorio de dominio.
@Module({
  imports: [AuditoriaModule, TypeOrmModule.forFeature([Licencia])],
  providers: [CalendarioLicenciasService, PoliticaAccesoLicenciaService],
  exports: [
    TypeOrmModule,
    CalendarioLicenciasService,
    PoliticaAccesoLicenciaService,
  ],
})
export class LicenciasModule {}
