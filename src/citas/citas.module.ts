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
import { RegistroCitaManualService } from './registro-cita-manual.service';
import { CambioEstadoCitaService } from './cambio-estado-cita.service';

import { CambioHorarioCitaService } from './cambio-horario-cita.service';
import { EfectoInicialService } from '../automatizaciones/efecto-inicial.service';
import { CambiosPoliticaCitaService } from '../automatizaciones/cambios-politica-cita.service';
import { CondicionConfirmacionCita } from '../automatizaciones/entities/condicion-confirmacion-cita.entity';
import { EnvioWhatsapp } from '../automatizaciones/entities/envio-whatsapp.entity';
import { CanalWhatsapp } from '../automatizaciones/entities/canal-whatsapp.entity';
import { ConfiguracionAutomatizaciones } from '../automatizaciones/entities/configuracion-automatizaciones.entity';

/** Dominio compartido: reutiliza las causas sin importar controladores ni escritores públicos. */
// El escritor manual y el público comparten el mismo servicio; registrar estas entidades
// permite que autoLoadEntities las incluya en la aplicación y en los módulos de prueba.
@Module({ imports: [AccesoOperativoModule, DisponibilidadModule, ClientesModule, TypeOrmModule.forFeature([
  EventoCita, IntentoCitaManual, CondicionConfirmacionCita, EnvioWhatsapp,
  CanalWhatsapp, ConfiguracionAutomatizaciones])],
  providers: [ConsultaAgendaService, IntentosCitaManualService, RegistroCitaManualService, CambioEstadoCitaService, CambioHorarioCitaService, CupoTelefonicoService, EfectoInicialService, CambiosPoliticaCitaService],
  exports: [TypeOrmModule, AccesoOperativoModule, ConsultaAgendaService, IntentosCitaManualService, RegistroCitaManualService, CambioEstadoCitaService, CambioHorarioCitaService, EfectoInicialService] })
export class CitasModule {}
