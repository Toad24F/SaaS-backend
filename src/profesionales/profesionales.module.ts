import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReservaCorreoService } from '../altas/reserva-correo.service';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { AutorizacionService } from '../auth/services/autorizacion.service';
import { PoliticaContrasenasService } from '../auth/services/politica-contrasenas.service';
import { Personal } from './entities/personal.entity';
import { PersonalSucursal } from './entities/personal-sucursal.entity';
import { PersonalServicio } from './entities/personal-servicio.entity';
import { ProfesionalesService } from './profesionales.service';

// Perfil y relaciones usan la política y reserva compartidas de identidad.
@Module({ imports: [TypeOrmModule.forFeature([Personal, PersonalSucursal, PersonalServicio]),
  AuditoriaModule],
  providers: [ProfesionalesService, AutorizacionService, PoliticaContrasenasService,
    ReservaCorreoService],
  exports: [TypeOrmModule, ProfesionalesService] })
export class ProfesionalesModule {}
