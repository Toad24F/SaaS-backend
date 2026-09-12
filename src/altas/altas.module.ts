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

@Module({
  imports: [UsuariosModule, NegociosModule, LicenciasModule, CodigosModule, AuditoriaModule],
  providers: [AltasService, ActivacionesService, AutorizacionService, PoliticaContrasenasService],
  exports: [AltasService, ActivacionesService],
})
export class AltasModule {}
