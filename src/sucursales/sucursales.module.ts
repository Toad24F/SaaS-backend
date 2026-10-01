import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Sucursal } from './entities/sucursal.entity';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { AutorizacionService } from '../auth/services/autorizacion.service';
import { SucursalesService } from './sucursales.service';

// El servicio comparte auditoría y permisos sin depender del módulo HTTP.
@Module({
  imports: [TypeOrmModule.forFeature([Sucursal]), AuditoriaModule],
  providers: [SucursalesService, AutorizacionService],
  exports: [TypeOrmModule, SucursalesService],
})
export class SucursalesModule {}
