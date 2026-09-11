import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { CodigoAcceso } from './entities/codigo-acceso.entity';

// Centraliza el registro del historial de activación y recuperación.
@Module({
  imports: [AuditoriaModule, TypeOrmModule.forFeature([CodigoAcceso])],
  exports: [TypeOrmModule],
})
export class CodigosModule {}
