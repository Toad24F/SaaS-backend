import { Module } from '@nestjs/common';
import { OcupacionesService } from './ocupaciones.service';

// Exporta el lector de fuentes reales; el motor le pasará su transacción y reloj.
@Module({ providers: [OcupacionesService], exports: [OcupacionesService] })
export class OcupacionesModule {}
