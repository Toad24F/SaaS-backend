import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventoCita } from './entities/evento-cita.entity';
import { IntentoCitaManual } from './entities/intento-cita-manual.entity';
import { AccesoOperativoModule } from './acceso-operativo.module';
import { ConsultaAgendaService } from './consulta-agenda.service';
import { DisponibilidadModule } from '../disponibilidad/disponibilidad.module';
import { ClientesModule } from '../clientes/clientes.module';
import { CupoTelefonicoService } from '../reservas-publicas/cupo-telefonico.service';
import { IntentosCitaManualService } from './intentos-cita-manual.service';

/** Dominio compartido: reutiliza las causas sin importar controladores ni escritores públicos. */
@Module({ imports: [AccesoOperativoModule, DisponibilidadModule, ClientesModule, TypeOrmModule.forFeature([EventoCita, IntentoCitaManual])],
  providers: [ConsultaAgendaService, IntentosCitaManualService, CupoTelefonicoService],
  exports: [TypeOrmModule, AccesoOperativoModule, ConsultaAgendaService, IntentosCitaManualService] })
export class CitasModule {}
