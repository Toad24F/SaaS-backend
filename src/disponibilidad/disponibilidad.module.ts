import { Module } from '@nestjs/common';
import { OcupacionesModule } from './ocupaciones.module';

// El dominio recibirá las fuentes de ocupación sin importar controladores HTTP.
@Module({ imports: [OcupacionesModule] })
export class DisponibilidadModule {}
