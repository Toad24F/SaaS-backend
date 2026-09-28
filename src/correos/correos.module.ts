import { Module } from '@nestjs/common';
import { TransporteCorreoSmtp } from './transporte-correo-smtp';
import { BandejaCorreoService } from './bandeja-correo.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EnvioCorreo } from './entities/envio-correo.entity';

// Encolar no llama al transporte; el ejecutor de pendientes llegará en T030–T033.
@Module({
  // Registra metadatos para autoLoadEntities; el servicio usa el manager del llamador.
  imports: [TypeOrmModule.forFeature([EnvioCorreo])],
  providers: [BandejaCorreoService,
    { provide: TransporteCorreoSmtp, useFactory: () => new TransporteCorreoSmtp() }],
  exports: [BandejaCorreoService, TransporteCorreoSmtp],
})
export class CorreosModule {}
