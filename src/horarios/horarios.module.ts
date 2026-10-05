import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HorarioPersonal } from './entities/horario-personal.entity';
import { ExcepcionHorario } from './entities/excepcion-horario.entity';
import { FranjaExcepcionHorario } from './entities/franja-excepcion-horario.entity';
import { HorariosService } from './horarios.service';
import { BloqueosModule } from '../bloqueos/bloqueos.module';
import { AtencionService } from './atencion.service';

// Comparte horarios y proyección de atención sin introducir rutas en el dominio.
@Module({ imports: [BloqueosModule, TypeOrmModule.forFeature([
  HorarioPersonal, ExcepcionHorario, FranjaExcepcionHorario,
])], providers: [HorariosService, AtencionService],
  exports: [TypeOrmModule, HorariosService, AtencionService] })
export class HorariosModule {}
