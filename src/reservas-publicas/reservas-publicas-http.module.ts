import { Module } from '@nestjs/common';
import { ReservasPublicasModule } from './reservas-publicas.module';
import { PortalPublicoController } from './portal-publico.controller';

/** Frontera HTTP: solo la inicialización, protegida por origen y CSRF inicial. */
@Module({ imports: [ReservasPublicasModule], controllers: [PortalPublicoController] })
export class ReservasPublicasHttpModule {}
