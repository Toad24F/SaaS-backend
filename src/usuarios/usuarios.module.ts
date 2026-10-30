import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Usuario } from './entities/usuario.entity';
import { UsuariosService } from './usuarios.service';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { PoliticaContrasenasService } from '../auth/services/politica-contrasenas.service';
import { ReservaCorreoService } from '../altas/reserva-correo.service';
import { CuposUsuariosService } from './cupos-usuarios.service';

@Module({
  // Negocio se registra desde NegociosModule; Usuarios solo posee su repositorio.
  imports: [TypeOrmModule.forFeature([Usuario]), AuditoriaModule],
  // El alta directa comparte la política bcrypt y la auditoría transaccional.
  providers: [UsuariosService, CuposUsuariosService,
    PoliticaContrasenasService, ReservaCorreoService],
  exports: [TypeOrmModule, UsuariosService, CuposUsuariosService], // HTTP comparte el conteo del dominio.
})
export class UsuariosModule { }
