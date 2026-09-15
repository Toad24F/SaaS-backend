import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UsuariosModule } from './usuarios.module';
import { RecepcionistasController } from './recepcionistas.controller';

// T80 retiró invitaciones; este módulo expone gestión y credenciales de recepción.
@Module({
  imports: [AuthModule, UsuariosModule],
  controllers: [RecepcionistasController],
  providers: [RolesGuard],
})
export class UsuariosHttpModule {}
