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

/** Frontera del dominio M01–M05: apartado, escritor y resolutor son internos
 * hasta que las rutas públicas y sus verificaciones se habiliten en T080–T081. */
// forFeature hace visibles las tres entidades al servidor con autoLoadEntities.
@Module({ imports: [DisponibilidadModule, LicenciasModule, TypeOrmModule.forFeature([
  SesionReservaPublica, OperacionApartado, IntentoReservaPublica,
])], providers: [ResolverNegocioPublicoService, SesionReservaPublicaService,
  ProteccionPortalService, CatalogoPublicoService,
  CoordinacionReservaPublicaService, ApartadosService, IntentosReservaPublicaService,
  RegistroReservaPublicaService, ResolucionReservaPublicaService], exports: [DisponibilidadModule,
  ResolverNegocioPublicoService, SesionReservaPublicaService,
  ProteccionPortalService, CatalogoPublicoService,
  CoordinacionReservaPublicaService, ApartadosService, IntentosReservaPublicaService,
  RegistroReservaPublicaService, ResolucionReservaPublicaService] })
export class ReservasPublicasModule {}
