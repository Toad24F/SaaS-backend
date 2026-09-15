import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AltasModule } from '../altas/altas.module';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RELOJ, RelojSistema } from '../comun/reloj';
import { UsuariosModule } from './usuarios.module';
import { RecepcionistasController } from './recepcionistas.controller';

// La capa HTTP compone autenticación y altas sin invertir dependencias del dominio.
@Module({
  imports: [AuthModule, AltasModule, UsuariosModule],
  controllers: [RecepcionistasController],
  providers: [RolesGuard, { provide: RELOJ, useClass: RelojSistema }],
})
export class UsuariosHttpModule {}
