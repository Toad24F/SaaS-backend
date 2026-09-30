import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Sucursal } from './entities/sucursal.entity';

// Registra la entidad en autoLoadEntities; T062 añadirá el servicio que la utiliza.
@Module({ imports: [TypeOrmModule.forFeature([Sucursal])], exports: [TypeOrmModule] })
export class SucursalesModule {}
