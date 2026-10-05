import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Personal } from '../profesionales/entities/personal.entity';
import { HorariosAccesoService } from './horarios-acceso.service';
import { HorariosController } from './horarios.controller';
import { HorariosModule } from './horarios.module';

// La capa HTTP depende del dominio sin introducir un ciclo entre módulos.
@Module({ imports: [AuthModule, HorariosModule, TypeOrmModule.forFeature([Personal])],
  controllers: [HorariosController],
  providers: [HorariosAccesoService, RolesGuard] })
export class HorariosHttpModule {}
