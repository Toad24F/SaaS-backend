import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
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
import { CitasAfectadasService } from './citas-afectadas.service';
import { RELOJ, RelojSistema } from '../comun/reloj';
import { ConfiguracionAgenda } from './entities/configuracion-agenda.entity';

// El dominio recibirá las fuentes de ocupación sin importar controladores HTTP.
// Importar módulos compartidos evita instancias paralelas de auditoría o licencia.
// Registrar la configuración permite que autoLoadEntities la incluya en el servidor real.
@Module({ imports: [OcupacionesModule, AuditoriaModule, LicenciasModule,
  TypeOrmModule.forFeature([ConfiguracionAgenda])],
  providers: [ConfiguracionAgendaService, ContextoDisponibilidadService,
    OfertaEfectivaService, BloqueosAplicablesService, AtencionInternaService,
    AutorizacionService, MotorDisponibilidadService, CitasAfectadasService,
    { provide: RELOJ, useClass: RelojSistema }],
  exports: [ConfiguracionAgendaService, ContextoDisponibilidadService,
    OfertaEfectivaService, AtencionInternaService, MotorDisponibilidadService,
    CitasAfectadasService] })
export class DisponibilidadModule {}
