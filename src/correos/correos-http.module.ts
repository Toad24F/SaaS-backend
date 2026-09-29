import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CorreosModule } from './correos.module';
import { EnviosCorreoController } from './envios-correo.controller';

// Auth depende del dominio; mantener HTTP separado evita futuros ciclos con Altas.
@Module({ imports: [AuthModule, CorreosModule], controllers: [EnviosCorreoController], providers: [RolesGuard] })
export class CorreosHttpModule {}
