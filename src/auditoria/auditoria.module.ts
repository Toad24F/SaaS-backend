import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventoAuditoria } from './entities/evento-auditoria.entity';
import { AuditoriaService } from './auditoria.service';

// Auditoría registra su propia persistencia sin depender de módulos coordinadores.
@Module({
  imports: [TypeOrmModule.forFeature([EventoAuditoria])],
  providers: [AuditoriaService],
  exports: [TypeOrmModule, AuditoriaService],
})
export class AuditoriaModule {}
