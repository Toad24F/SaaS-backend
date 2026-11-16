import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Cliente } from '../disponibilidad/entities/cliente.entity';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { AccesoOperativoModule } from '../citas/acceso-operativo.module';
import { ClientesService } from './clientes.service';

/** Dominio de fichas exportado para HTTP y para la selección del futuro escritor manual. */
@Module({ imports: [AccesoOperativoModule, AuditoriaModule, TypeOrmModule.forFeature([Cliente])],
  providers: [ClientesService], exports: [ClientesService] })
export class ClientesModule {}
