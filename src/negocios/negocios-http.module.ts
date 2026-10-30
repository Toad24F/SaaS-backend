import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AltasModule } from '../altas/altas.module';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RELOJ, RelojSistema } from '../comun/reloj';
import { NegociosModule } from './negocios.module';
import { NegociosController } from './negocios.controller';
import { PublicacionCatalogoController } from './publicacion-catalogo.controller';
import { SucursalesModule } from '../sucursales/sucursales.module';
import { UsuariosModule } from '../usuarios/usuarios.module';
import { PublicacionCatalogoService } from './publicacion-catalogo.service';
import { AuditoriaService } from '../auditoria/auditoria.service';

// La composición HTTP depende de Auth y Altas; el dominio Negocios no depende
// de ellos, evitando un ciclo al reutilizar el alta y las protecciones existentes.
@Module({
  imports: [AuthModule, AltasModule, NegociosModule, SucursalesModule, UsuariosModule],
  // Registrar la ruta literal antes de /negocios/:id evita que este capture GET.
  controllers: [PublicacionCatalogoController, NegociosController],
  providers: [RolesGuard, PublicacionCatalogoService, AuditoriaService,
    { provide: RELOJ, useClass: RelojSistema }],
})
export class NegociosHttpModule {}
