import { Module } from '@nestjs/common';
import { OcupacionesModule } from './ocupaciones.module';
import { ConfiguracionAgendaService } from './configuracion-agenda.service';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { AutorizacionService } from '../auth/services/autorizacion.service';
import { LicenciasModule } from '../licencias/licencias.module';
import { ContextoDisponibilidadService } from './contexto-disponibilidad.service';
import { OfertaEfectivaService } from './oferta-efectiva.service';
import { BloqueosAplicablesService } from './bloqueos-aplicables.service';
import { AtencionInternaService } from './atencion-interna.service';
import { MotorDisponibilidadService } from './motor-disponibilidad.service';
import { RELOJ, RelojSistema } from '../comun/reloj';

// El dominio recibirá las fuentes de ocupación sin importar controladores HTTP.
// Importar módulos compartidos evita instancias paralelas de auditoría o licencia.
@Module({ imports: [OcupacionesModule, AuditoriaModule, LicenciasModule],
  providers: [ConfiguracionAgendaService, ContextoDisponibilidadService,
    OfertaEfectivaService, BloqueosAplicablesService, AtencionInternaService,
    AutorizacionService, MotorDisponibilidadService,
    { provide: RELOJ, useClass: RelojSistema }],
  exports: [ConfiguracionAgendaService, ContextoDisponibilidadService,
    OfertaEfectivaService, AtencionInternaService, MotorDisponibilidadService] })
export class DisponibilidadModule {}
