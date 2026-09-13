import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AltasModule } from '../altas/altas.module';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RELOJ, RelojSistema } from '../comun/reloj';
import { NegociosModule } from './negocios.module';
import { NegociosController } from './negocios.controller';

// La composición HTTP depende de Auth y Altas; el dominio Negocios no depende
// de ellos, evitando un ciclo al reutilizar el alta y las protecciones existentes.
@Module({
  imports: [AuthModule, AltasModule, NegociosModule],
  controllers: [NegociosController],
  providers: [RolesGuard, { provide: RELOJ, useClass: RelojSistema }],
})
export class NegociosHttpModule {}
