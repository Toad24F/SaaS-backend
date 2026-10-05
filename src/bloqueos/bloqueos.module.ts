import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AutorizacionService } from '../auth/services/autorizacion.service';
import { BloqueosService } from './bloqueos.service';
import { BloqueoHorario } from './entities/bloqueo-horario.entity';

// El dominio comparte la autorización existente; la capa HTTP se incorpora en T108.
@Module({ imports: [TypeOrmModule.forFeature([BloqueoHorario])],
  providers: [BloqueosService, AutorizacionService], exports: [TypeOrmModule, BloqueosService] })
export class BloqueosModule {}
