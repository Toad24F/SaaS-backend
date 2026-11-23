import type { Cita } from '../disponibilidad/entities/cita.entity';
import type { TipoEnvioWhatsapp } from './entities/envio-whatsapp.entity';

export interface PlantillaWhatsapp {
  cuerpo: string[];
  respuestaRapida?: string;
}

/** Lista explícita de campos históricos que pueden salir de la cita hacia la bandeja. */
export function resumenWhatsapp(cita: Cita) {
  return {
    nombreNegocio: cita.nombreNegocio,
    nombreServicio: cita.nombreServicio,
    nombreSucursal: cita.nombreSucursal,
    nombreProfesional: cita.nombreProfesional,
    inicioUtc: cita.inicioUtc.toISOString(),
    zonaHoraria: cita.zonaHorariaReserva,
  };
}

function fechaEnZona(instante: Date, zona: string): string {
  const fecha = new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'short', timeStyle: 'medium', hourCycle: 'h23', timeZone: zona,
  }).format(instante);
  const desfase = new Intl.DateTimeFormat('es-MX', { timeZone: zona, timeZoneName: 'longOffset' })
    .formatToParts(instante).find((parte) => parte.type === 'timeZoneName')?.value;
  return `${fecha} ${zona} (${desfase})`;
}

/** Los parámetros posicionales siguen el mismo orden en las tres plantillas. */
export function construirPlantillaWhatsapp(tipo: TipoEnvioWhatsapp, cita: Cita,
  vencimientoUtc: Date | null, respuestaRapida?: string): PlantillaWhatsapp {
  const resumen = resumenWhatsapp(cita);
  const cuerpo = [resumen.nombreNegocio ?? 'Negocio', resumen.nombreServicio ?? 'Servicio',
    resumen.nombreSucursal ?? 'Sucursal', resumen.nombreProfesional ?? 'Profesional',
    fechaEnZona(cita.inicioUtc, resumen.zonaHoraria)];
  if (tipo !== 'inicial_pendiente') return { cuerpo };
  cuerpo.push(vencimientoUtc
    ? `Confirma antes de ${fechaEnZona(vencimientoUtc, resumen.zonaHoraria)}. Si no confirmas, la cita puede quedar sujeta a cancelación.`
    : 'Seguimiento manual; sin cancelación automática por plazo.');
  return { cuerpo, respuestaRapida };
}
