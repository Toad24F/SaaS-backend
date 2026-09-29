import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { Licencia } from './entities/licencia.entity';
import { CalendarioLicenciasService } from './services/calendario-licencias.service';
import { PoliticaAccesoLicenciaService } from './services/politica-acceso-licencia.service';
import { LicenciasService } from './licencias.service';
import { AutorizacionService } from '../auth/services/autorizacion.service';
import { VistaVigenciaLicenciaService } from './services/vista-vigencia-licencia.service';
import { ConsultaVigenciaLicenciasService } from './services/consulta-vigencia-licencias.service';

// Las operaciones posteriores reutilizarán este repositorio de dominio.
@Module({
  imports: [AuditoriaModule, TypeOrmModule.forFeature([Licencia])],
  providers: [CalendarioLicenciasService, PoliticaAccesoLicenciaService, LicenciasService,
    VistaVigenciaLicenciaService, ConsultaVigenciaLicenciasService, AutorizacionService],
  exports: [
    TypeOrmModule,
    CalendarioLicenciasService,
    PoliticaAccesoLicenciaService,
    LicenciasService,
    VistaVigenciaLicenciaService,
    ConsultaVigenciaLicenciasService,
  ],
})
export class LicenciasModule {}
