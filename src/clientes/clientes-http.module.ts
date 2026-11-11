import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ClientesModule } from './clientes.module';
import { ClientesController } from './clientes.controller';

// Sigue la composición privada existente: el dominio no importa controladores ni autenticación HTTP.
@Module({ imports: [AuthModule, ClientesModule], controllers: [ClientesController] })
export class ClientesHttpModule {}
