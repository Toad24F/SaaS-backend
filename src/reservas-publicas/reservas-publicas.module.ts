import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SesionReservaPublica } from './entities/sesion-reserva-publica.entity';
import { OperacionApartado } from './entities/operacion-apartado.entity';
import { IntentoReservaPublica } from './entities/intento-reserva-publica.entity';
import { DisponibilidadModule } from '../disponibilidad/disponibilidad.module';
import { LicenciasModule } from '../licencias/licencias.module';
import { ResolverNegocioPublicoService } from './resolver-negocio-publico.service';
import { SesionReservaPublicaService } from './sesion-reserva-publica.service';
import { ProteccionPortalService } from './proteccion-portal.service';
import { CatalogoPublicoService } from './catalogo-publico.service';

/** Frontera del dominio M01–M05; los escritores se incorporarán tras persistencia y coordinación. */
// forFeature hace visibles las tres entidades al servidor con autoLoadEntities.
@Module({ imports: [DisponibilidadModule, LicenciasModule, TypeOrmModule.forFeature([
  SesionReservaPublica, OperacionApartado, IntentoReservaPublica,
])], providers: [ResolverNegocioPublicoService, SesionReservaPublicaService,
  ProteccionPortalService, CatalogoPublicoService], exports: [DisponibilidadModule,
  ResolverNegocioPublicoService, SesionReservaPublicaService,
  ProteccionPortalService, CatalogoPublicoService] })
export class ReservasPublicasModule {}
