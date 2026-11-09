import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventoCita } from './entities/evento-cita.entity';
import { IntentoCitaManual } from './entities/intento-cita-manual.entity';

/** Persistencia compartida: carga el modelo en Nest sin habilitar rutas operativas. */
@Module({ imports: [TypeOrmModule.forFeature([EventoCita, IntentoCitaManual])],
  exports: [TypeOrmModule] })
export class CitasModule {}
