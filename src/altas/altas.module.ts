import { Module } from '@nestjs/common';
import { UsuariosModule } from '../usuarios/usuarios.module';
import { NegociosModule } from '../negocios/negocios.module';
import { LicenciasModule } from '../licencias/licencias.module';
import { CodigosModule } from '../codigos/codigos.module';
import { AuditoriaModule } from '../auditoria/auditoria.module';

@Module({
  imports: [UsuariosModule, NegociosModule, LicenciasModule, CodigosModule, AuditoriaModule],
})
export class AltasModule {}
