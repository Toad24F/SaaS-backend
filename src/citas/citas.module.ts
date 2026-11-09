import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventoCita } from './entities/evento-cita.entity';
import { IntentoCitaManual } from './entities/intento-cita-manual.entity';
import { AccesoOperativoModule } from './acceso-operativo.module';
import { ConsultaAgendaService } from './consulta-agenda.service';
import { DisponibilidadModule } from '../disponibilidad/disponibilidad.module';

/** Dominio compartido: reutiliza las causas sin importar controladores ni escritores públicos. */
@Module({ imports: [AccesoOperativoModule, DisponibilidadModule, TypeOrmModule.forFeature([EventoCita, IntentoCitaManual])],
  providers: [ConsultaAgendaService],
  exports: [TypeOrmModule, AccesoOperativoModule, ConsultaAgendaService] })
export class CitasModule {}
