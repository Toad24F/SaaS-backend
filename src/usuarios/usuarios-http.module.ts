import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UsuariosModule } from './usuarios.module';
import { RecepcionistasController } from './recepcionistas.controller';

// T80 retira la dependencia de invitaciones; conserva consulta y desactivación.
@Module({
  imports: [AuthModule, UsuariosModule],
  controllers: [RecepcionistasController],
  providers: [RolesGuard],
})
export class UsuariosHttpModule {}
