import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RELOJ, RelojSistema } from '../comun/reloj';
import { LicenciasModule } from '../licencias/licencias.module';
import { AccionesWhatsappService, CLAVE_ACCIONES_WHATSAPP } from './acciones-whatsapp.service';
import { ArrendamientoWhatsappService } from './arrendamiento-whatsapp.service';
import { CancelacionAutomaticaCitasService } from './cancelacion-automatica-citas.service';
import { AccionConfirmacion } from './entities/accion-confirmacion.entity';
import { CanalWhatsapp } from './entities/canal-whatsapp.entity';
import { CondicionConfirmacionCita } from './entities/condicion-confirmacion-cita.entity';
import { EnvioWhatsapp } from './entities/envio-whatsapp.entity';
import { EventoWhatsapp } from './entities/evento-whatsapp.entity';
import { PREPARAR_ACCION_WHATSAPP, ProcesadorWhatsappService } from './procesador-whatsapp.service';
import { RecepcionWhatsappService } from './recepcion-whatsapp.service';
import { MetaWhatsapp, TRANSPORTE_WHATSAPP } from './transporte-whatsapp';
import { CONFIGURACION_WEBHOOK_WHATSAPP, type ConfiguracionWebhookWhatsapp, WebhookWhatsappController } from './webhook-whatsapp.http';

/** Registra el procesador invocable. El ciclo periódico se integra en M5-T096. */
@Module({
  imports: [LicenciasModule, TypeOrmModule.forFeature([AccionConfirmacion, CanalWhatsapp, CondicionConfirmacionCita,
    EnvioWhatsapp, EventoWhatsapp])],
  controllers: [WebhookWhatsappController],
  providers: [
    { provide: RELOJ, useClass: RelojSistema },
    { provide: TRANSPORTE_WHATSAPP, useFactory: crearTransporte },
    { provide: CONFIGURACION_WEBHOOK_WHATSAPP, useFactory: () => ({
      secretoApp: process.env.WHATSAPP_WEBHOOK_APP_SECRET,
      tokenVerificacion: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
    }) },
    { provide: CLAVE_ACCIONES_WHATSAPP, useFactory: () => process.env.WHATSAPP_CONFIRMACION_HMAC_SECRET ?? '' },
    { provide: PREPARAR_ACCION_WHATSAPP, inject: [AccionesWhatsappService, CONFIGURACION_WEBHOOK_WHATSAPP],
      // El botón se ofrece cuando el entorno puede generar y verificar la respuesta.
      useFactory: (acciones: AccionesWhatsappService, webhook: ConfiguracionWebhookWhatsapp) =>
        acciones.habilitada && webhook.secretoApp ? acciones.preparar.bind(acciones) : undefined },
    AccionesWhatsappService,
    ArrendamientoWhatsappService,
    CancelacionAutomaticaCitasService,
    ProcesadorWhatsappService,
    RecepcionWhatsappService,
  ],
  exports: [ProcesadorWhatsappService, CancelacionAutomaticaCitasService],
})
export class EnviosWhatsappModule {}

function crearTransporte(): MetaWhatsapp {
  return new MetaWhatsapp({
    versionGraph: process.env.WHATSAPP_GRAPH_VERSION ?? '',
    idioma: process.env.WHATSAPP_IDIOMA ?? '',
    plantillas: {
      inicial_pendiente: process.env.WHATSAPP_PLANTILLA_PENDIENTE ?? '',
      inicial_confirmada: process.env.WHATSAPP_PLANTILLA_CONFIRMADA ?? '',
      recordatorio: process.env.WHATSAPP_PLANTILLA_RECORDATORIO ?? '',
    },
  }, async (referencia) => {
    // El despliegue inyecta el mapa secreto y conserva solo sus claves secret:// en la base.
    const secretos = JSON.parse(process.env.WHATSAPP_SECRETOS_JSON ?? '{}') as Record<string, unknown> | null;
    const token = secretos && Object.hasOwn(secretos, referencia) ? secretos[referencia] : undefined;
    return typeof token === 'string' ? token : undefined;
  });
}
