import { Module } from '@nestjs/common';
import { OcupacionesModule } from './ocupaciones.module';
import { ConfiguracionAgendaService } from './configuracion-agenda.service';
import { AuditoriaService } from '../auditoria/auditoria.service';

// El dominio recibirá las fuentes de ocupación sin importar controladores HTTP.
@Module({ imports: [OcupacionesModule],
  providers: [ConfiguracionAgendaService, AuditoriaService],
  exports: [ConfiguracionAgendaService] })
export class DisponibilidadModule {}
