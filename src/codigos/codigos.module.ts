import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { CodigoAcceso } from './entities/codigo-acceso.entity';
import { CodigosService } from './codigos.service';
import { DerivadorCodigo } from './derivador-codigo';

// Centraliza el registro del historial de activación y recuperación.
@Module({
  imports: [AuditoriaModule, TypeOrmModule.forFeature([CodigoAcceso])],
  // Las claves se leen del entorno, nunca se inyectan como valores del módulo.
  providers: [CodigosService, { provide: DerivadorCodigo, useFactory: () => new DerivadorCodigo() }],
  exports: [TypeOrmModule, CodigosService],
})
export class CodigosModule {}
