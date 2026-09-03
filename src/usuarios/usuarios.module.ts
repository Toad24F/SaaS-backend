import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Negocio } from './entities/negocio.entity';
import { Usuario } from './entities/usuario.entity';
import { UsuariosService } from './usuarios.service';

@Module({
  imports: [TypeOrmModule.forFeature([Usuario, Negocio])],
  providers: [UsuariosService],
  exports: [UsuariosService], // Exportamos para que AuthModule pueda usarlo
})
export class UsuariosModule { }