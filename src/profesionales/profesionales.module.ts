import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReservaCorreoService } from '../altas/reserva-correo.service';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { AutorizacionService } from '../auth/services/autorizacion.service';
import { PoliticaContrasenasService } from '../auth/services/politica-contrasenas.service';
import { Personal } from './entities/personal.entity';
import { PersonalSucursal } from './entities/personal-sucursal.entity';
import { PersonalServicio } from './entities/personal-servicio.entity';
import { PersonalServicioSucursal } from './entities/personal-servicio-sucursal.entity';
import { ProfesionalesService } from './profesionales.service';

// Perfil y relaciones usan la política y reserva compartidas de identidad.
// Registrar la combinación permite usar su repositorio y relaciones en consultas futuras.
@Module({ imports: [TypeOrmModule.forFeature([
  Personal, PersonalSucursal, PersonalServicio, PersonalServicioSucursal,
]),
  AuditoriaModule],
  providers: [ProfesionalesService, AutorizacionService, PoliticaContrasenasService,
    ReservaCorreoService],
  exports: [TypeOrmModule, ProfesionalesService] })
export class ProfesionalesModule {}
