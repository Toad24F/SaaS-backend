import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Cliente } from '../disponibilidad/entities/cliente.entity';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { AccesoOperativoModule } from '../citas/acceso-operativo.module';
import { ClientesService } from './clientes.service';
import { UnionCliente } from './entities/union-cliente.entity';
import { ResolucionClienteService } from './resolucion-cliente.service';

/** El resolutor interno comparte el dominio con el directorio y usa la transacción del escritor. */
@Module({ imports: [AccesoOperativoModule, AuditoriaModule, TypeOrmModule.forFeature([Cliente, UnionCliente])],
  providers: [ClientesService, ResolucionClienteService], exports: [ClientesService, ResolucionClienteService] })
export class ClientesModule {}
