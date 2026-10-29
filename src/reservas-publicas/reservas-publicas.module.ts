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
import { CoordinacionReservaPublicaService } from './coordinacion-reserva-publica.service';
import { ApartadosService } from './apartados.service';
import { IntentosReservaPublicaService } from './intentos-reserva-publica.service';
import { RegistroReservaPublicaService } from './registro-reserva-publica.service';
import { ResolucionReservaPublicaService } from './resolucion-reserva-publica.service';
import { MetricasPortalService } from './metricas-portal.service';

/** Frontera del dominio M01–M05: exporta los colaboradores de apartado,
 * registro y resolución para la capa HTTP con autorización pública propia. */
// forFeature hace visibles las tres entidades al servidor con autoLoadEntities.
@Module({ imports: [DisponibilidadModule, LicenciasModule, TypeOrmModule.forFeature([
  SesionReservaPublica, OperacionApartado, IntentoReservaPublica,
])], providers: [ResolverNegocioPublicoService, SesionReservaPublicaService,
  ProteccionPortalService, CatalogoPublicoService,
  CoordinacionReservaPublicaService, ApartadosService, IntentosReservaPublicaService,
  RegistroReservaPublicaService, ResolucionReservaPublicaService,
  MetricasPortalService], exports: [DisponibilidadModule,
  ResolverNegocioPublicoService, SesionReservaPublicaService,
  ProteccionPortalService, CatalogoPublicoService,
  CoordinacionReservaPublicaService, ApartadosService, IntentosReservaPublicaService,
  RegistroReservaPublicaService, ResolucionReservaPublicaService,
  MetricasPortalService] })
export class ReservasPublicasModule {}
