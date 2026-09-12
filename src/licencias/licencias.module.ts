import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { Licencia } from './entities/licencia.entity';
import { CalendarioLicenciasService } from './services/calendario-licencias.service';
import { PoliticaAccesoLicenciaService } from './services/politica-acceso-licencia.service';
import { LicenciasService } from './licencias.service';
import { AutorizacionService } from '../auth/services/autorizacion.service';

// Las operaciones posteriores reutilizarán este repositorio de dominio.
@Module({
  imports: [AuditoriaModule, TypeOrmModule.forFeature([Licencia])],
  providers: [CalendarioLicenciasService, PoliticaAccesoLicenciaService, LicenciasService, AutorizacionService],
  exports: [
    TypeOrmModule,
    CalendarioLicenciasService,
    PoliticaAccesoLicenciaService,
    LicenciasService,
  ],
})
export class LicenciasModule {}
