import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Usuario } from './entities/usuario.entity';
import { UsuariosService } from './usuarios.service';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { PoliticaContrasenasService } from '../auth/services/politica-contrasenas.service';

@Module({
  // Negocio se registra desde NegociosModule; Usuarios solo posee su repositorio.
  imports: [TypeOrmModule.forFeature([Usuario]), AuditoriaModule],
  // El alta directa comparte la política bcrypt y la auditoría transaccional.
  providers: [UsuariosService, PoliticaContrasenasService],
  exports: [TypeOrmModule, UsuariosService], // Altas reutiliza el repositorio dentro de su transacción.
})
export class UsuariosModule { }
