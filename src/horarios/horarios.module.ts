import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HorarioPersonal } from './entities/horario-personal.entity';
import { ExcepcionHorario } from './entities/excepcion-horario.entity';
import { FranjaExcepcionHorario } from './entities/franja-excepcion-horario.entity';
import { HorariosService } from './horarios.service';

// Comparte el guardado semanal; los contratos HTTP llegan en tareas posteriores.
@Module({ imports: [TypeOrmModule.forFeature([
  HorarioPersonal, ExcepcionHorario, FranjaExcepcionHorario,
])], providers: [HorariosService], exports: [TypeOrmModule, HorariosService] })
export class HorariosModule {}
