import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { AutorizacionService } from '../auth/services/autorizacion.service';
import { Servicio } from './entities/servicio.entity';
import { ServiciosService } from './servicios.service';

// Registra persistencia y permisos del catálogo sin depender de HTTP.
@Module({ imports: [TypeOrmModule.forFeature([Servicio]), AuditoriaModule],
  providers: [ServiciosService, AutorizacionService],
  exports: [TypeOrmModule, ServiciosService] })
export class ServiciosModule {}
