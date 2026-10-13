import { Module } from '@nestjs/common';
import { DisponibilidadModule } from './disponibilidad.module';

// Reserva el límite HTTP privado; las rutas se incorporan en M2-T060–T071.
@Module({ imports: [DisponibilidadModule] })
export class DisponibilidadHttpModule {}
