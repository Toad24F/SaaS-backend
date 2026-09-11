import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventoAuditoria } from './entities/evento-auditoria.entity';

// Auditoría registra su propia persistencia sin depender de módulos coordinadores.
@Module({
  imports: [TypeOrmModule.forFeature([EventoAuditoria])],
  exports: [TypeOrmModule],
})
export class AuditoriaModule {}
