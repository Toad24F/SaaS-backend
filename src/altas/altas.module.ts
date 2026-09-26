import { Module } from '@nestjs/common';
import { UsuariosModule } from '../usuarios/usuarios.module';
import { NegociosModule } from '../negocios/negocios.module';
import { LicenciasModule } from '../licencias/licencias.module';
import { CodigosModule } from '../codigos/codigos.module';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { AutorizacionService } from '../auth/services/autorizacion.service';
import { AltasService } from './altas.service';
import { ActivacionesService } from './activaciones.service';
import { PoliticaContrasenasService } from '../auth/services/politica-contrasenas.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AltaAdministrador } from './entities/alta-administrador.entity';
import { CorreoAcceso } from './entities/correo-acceso.entity';

@Module({
  // Registra los destinos nuevos para que autoLoadEntities resuelva sus relaciones.
  imports: [TypeOrmModule.forFeature([AltaAdministrador, CorreoAcceso]),
    UsuariosModule, NegociosModule, LicenciasModule, CodigosModule, AuditoriaModule],
  providers: [AltasService, ActivacionesService, AutorizacionService, PoliticaContrasenasService],
  exports: [AltasService, ActivacionesService],
})
export class AltasModule {}
