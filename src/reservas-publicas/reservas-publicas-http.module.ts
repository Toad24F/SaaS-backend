import { Module } from '@nestjs/common';
import { ReservasPublicasModule } from './reservas-publicas.module';
import { PortalPublicoController } from './portal-publico.controller';

/** Frontera HTTP de las nueve rutas públicas; protege las mutaciones con cookie,
 * origen y CSRF, y conserva el dominio independiente del transporte. */
@Module({ imports: [ReservasPublicasModule], controllers: [PortalPublicoController] })
export class ReservasPublicasHttpModule {}
