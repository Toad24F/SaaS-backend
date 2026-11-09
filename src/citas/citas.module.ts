import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventoCita } from './entities/evento-cita.entity';
import { IntentoCitaManual } from './entities/intento-cita-manual.entity';
import { LicenciasModule } from '../licencias/licencias.module';
import { AutorizacionService } from '../auth/services/autorizacion.service';
import { RELOJ, RelojSistema } from '../comun/reloj';
import { AccesoOperativoService } from './acceso-operativo.service';
import { ConsultaAgendaService } from './consulta-agenda.service';
import { DisponibilidadModule } from '../disponibilidad/disponibilidad.module';

/** Dominio compartido: reutiliza las causas sin importar controladores ni escritores públicos. */
@Module({ imports: [LicenciasModule, DisponibilidadModule, TypeOrmModule.forFeature([EventoCita, IntentoCitaManual])],
  providers: [AccesoOperativoService, ConsultaAgendaService, AutorizacionService, { provide: RELOJ, useClass: RelojSistema }],
  exports: [TypeOrmModule, AccesoOperativoService, ConsultaAgendaService] })
export class CitasModule {}
