import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SesionReservaPublica } from './entities/sesion-reserva-publica.entity';
import { OperacionApartado } from './entities/operacion-apartado.entity';
import { IntentoReservaPublica } from './entities/intento-reserva-publica.entity';

/** Frontera del dominio M01–M05; los escritores se incorporarán tras persistencia y coordinación. */
// forFeature hace visibles las tres entidades al servidor con autoLoadEntities.
@Module({ imports: [TypeOrmModule.forFeature([
  SesionReservaPublica, OperacionApartado, IntentoReservaPublica,
])] })
export class ReservasPublicasModule {}
