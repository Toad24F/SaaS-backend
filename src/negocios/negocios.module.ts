import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Negocio } from './entities/negocio.entity';
import { NegociosConsultaService } from './negocios-consulta.service';

// El módulo de dominio es el único responsable de registrar el repositorio de negocios.
@Module({
  imports: [TypeOrmModule.forFeature([Negocio])],
  // La consulta usa el repositorio del dominio sin importar autenticación HTTP.
  providers: [NegociosConsultaService],
  exports: [TypeOrmModule, NegociosConsultaService],
})
export class NegociosModule {}
