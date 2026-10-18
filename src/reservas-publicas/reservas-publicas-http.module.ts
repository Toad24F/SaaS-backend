import { Module } from '@nestjs/common';
import { ReservasPublicasModule } from './reservas-publicas.module';

/** Frontera HTTP sin controladores hasta que existan autorización y escritores seguros. */
@Module({ imports: [ReservasPublicasModule] })
export class ReservasPublicasHttpModule {}
