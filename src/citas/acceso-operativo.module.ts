import { Module } from '@nestjs/common';
import { LicenciasModule } from '../licencias/licencias.module';
import { AutorizacionService } from '../auth/services/autorizacion.service';
import { RELOJ, RelojSistema } from '../comun/reloj';
import { AccesoOperativoService } from './acceso-operativo.service';

/** Una frontera compartida para citas y clientes, sin importar controladores ni coordinadores de escritura. */
@Module({ imports: [LicenciasModule],
  providers: [AccesoOperativoService, AutorizacionService, { provide: RELOJ, useClass: RelojSistema }],
  exports: [AccesoOperativoService] })
export class AccesoOperativoModule {}
