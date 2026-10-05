import { Module } from '@nestjs/common';
import { CorreosModule } from '../correos/correos.module';
import { LicenciasModule } from '../licencias/licencias.module';
import { RELOJ, RelojSistema } from '../comun/reloj';
import { EJECUTOR_AUTOMATICO, EjecucionPeriodicaService } from './ejecucion-periodica.service';

/** Un solo coordinador por proceso; la base serializa trabajos entre procesos. */
@Module({
  imports: [CorreosModule, LicenciasModule],
  providers: [
    { provide: RELOJ, useClass: RelojSistema },
    { provide: EJECUTOR_AUTOMATICO, useValue: process.env.NODE_ENV !== 'test' },
    EjecucionPeriodicaService,
  ],
  exports: [EjecucionPeriodicaService],
})
export class OperacionModule {}
