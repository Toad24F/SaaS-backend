import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CitasModule } from './citas.module';
import { CitasController } from './citas.controller';

// La composición HTTP es independiente del dominio que importa el escritor público.
@Module({ imports: [AuthModule, CitasModule], controllers: [CitasController] })
export class CitasHttpModule {}
