import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Usuario } from './entities/usuario.entity';
import { UsuariosService } from './usuarios.service';

@Module({
  // Negocio se registra desde NegociosModule; Usuarios solo posee su repositorio.
  imports: [TypeOrmModule.forFeature([Usuario])],
  providers: [UsuariosService],
  exports: [TypeOrmModule, UsuariosService], // Altas reutiliza el repositorio dentro de su transacción.
})
export class UsuariosModule { }
