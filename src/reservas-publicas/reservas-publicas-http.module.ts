import { Module } from '@nestjs/common';
import { ReservasPublicasModule } from './reservas-publicas.module';
import { PortalPublicoController } from './portal-publico.controller';

/** Frontera HTTP: consulta anónima de oferta y agenda; sesión con protección propia. */
@Module({ imports: [ReservasPublicasModule], controllers: [PortalPublicoController] })
export class ReservasPublicasHttpModule {}
