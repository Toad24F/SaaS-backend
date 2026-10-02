import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HorarioPersonal } from './entities/horario-personal.entity';
import { ExcepcionHorario } from './entities/excepcion-horario.entity';
import { FranjaExcepcionHorario } from './entities/franja-excepcion-horario.entity';

// Registra el modelo persistente; los casos de uso y HTTP llegan en tareas posteriores.
@Module({ imports: [TypeOrmModule.forFeature([
  HorarioPersonal, ExcepcionHorario, FranjaExcepcionHorario,
])], exports: [TypeOrmModule] })
export class HorariosModule {}
