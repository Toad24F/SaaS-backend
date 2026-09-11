import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { Licencia } from './entities/licencia.entity';

// Las operaciones posteriores reutilizarán este repositorio de dominio.
@Module({
  imports: [AuditoriaModule, TypeOrmModule.forFeature([Licencia])],
  exports: [TypeOrmModule],
})
export class LicenciasModule {}
