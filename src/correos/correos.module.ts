import { Module } from '@nestjs/common';
import { TransporteCorreoSmtp } from './transporte-correo-smtp';
import { BandejaCorreoService } from './bandeja-correo.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EnvioCorreo } from './entities/envio-correo.entity';
import { DataSource } from 'typeorm';
import { ProcesadorCorreoService } from './procesador-correo.service';
import { DerivadorCodigo } from '../codigos/derivador-codigo';
import { RELOJ, RelojSistema } from '../comun/reloj';
import type { Reloj } from '../comun/reloj';

// El procesador está disponible bajo demanda; la ejecución periódica llegará en T121.
@Module({
  // Registra metadatos para autoLoadEntities; el servicio usa el manager del llamador.
  imports: [TypeOrmModule.forFeature([EnvioCorreo])],
  providers: [BandejaCorreoService,
    { provide: RELOJ, useClass: RelojSistema },
    { provide: TransporteCorreoSmtp, useFactory: () => new TransporteCorreoSmtp() },
    { provide: ProcesadorCorreoService, inject: [DataSource, TransporteCorreoSmtp, RELOJ],
      useFactory: (db: DataSource, smtp: TransporteCorreoSmtp, reloj: Reloj) =>
        new ProcesadorCorreoService(db, smtp, new DerivadorCodigo(), reloj) }],
  exports: [BandejaCorreoService, TransporteCorreoSmtp, ProcesadorCorreoService],
})
export class CorreosModule {}
