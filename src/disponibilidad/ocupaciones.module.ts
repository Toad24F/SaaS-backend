import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OcupacionesService } from './ocupaciones.service';
import { BloqueoTemporal } from './entities/bloqueo-temporal.entity';
import { Cita } from './entities/cita.entity';
import { Cliente } from './entities/cliente.entity';

// autoLoadEntities solo incluye entidades registradas; Cita requiere también Cliente por su relación.
// El motor comparte estas fuentes con citas afectadas sin publicar escritores ni rutas.
@Module({ imports: [TypeOrmModule.forFeature([Cliente, Cita, BloqueoTemporal])],
  providers: [OcupacionesService], exports: [OcupacionesService] })
export class OcupacionesModule {}
