import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Negocio } from './entities/negocio.entity';

// El módulo de dominio es el único responsable de registrar el repositorio de negocios.
@Module({
  imports: [TypeOrmModule.forFeature([Negocio])],
  exports: [TypeOrmModule],
})
export class NegociosModule {}
