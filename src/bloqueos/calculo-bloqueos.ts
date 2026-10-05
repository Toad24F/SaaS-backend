import { BadRequestException } from '@nestjs/common';
import { resolverInstanteLocal } from '../horarios/calendario';
import type { DatosBloqueo } from './validar-bloqueo';

export interface Intervalo { inicio: Date; fin: Date }

function siguienteDia(fecha: string): string {
  return new Date(Date.parse(`${fecha}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
}

/** Un bloque colectivo se interpreta de nuevo en la zona de cada sede afectada. */
export function intervaloBloqueo(datos: DatosBloqueo, zona: string): Intervalo {
  const diaCompleto = datos.inicioMinutos === null;
  const fechaFin = diaCompleto ? siguienteDia(datos.fechaFin) :
    datos.finMinutos === 1440 ? siguienteDia(datos.fechaFin) : datos.fechaFin;
  const inicio = resolverInstanteLocal(datos.fechaInicio,
    diaCompleto ? 0 : datos.inicioMinutos!, zona);
  const fin = resolverInstanteLocal(fechaFin,
    diaCompleto || datos.finMinutos === 1440 ? 0 : datos.finMinutos!, zona);
  if (fin <= inicio) throw new BadRequestException('Bloqueo: intervalo vacío o invertido.');
  return { inicio, fin };
}

/** Resta la unión lógica de bloqueos sin modificar ni fusionar sus filas guardadas. */
export function restarRestricciones(base: Intervalo[], bloqueos: Intervalo[]): Intervalo[] {
  let restantes = [...base].sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
  for (const bloqueo of [...bloqueos].sort((a, b) => a.inicio.getTime() - b.inicio.getTime())) {
    const siguientes: Intervalo[] = [];
    for (const tramo of restantes) {
      if (bloqueo.fin <= tramo.inicio || bloqueo.inicio >= tramo.fin) {
        siguientes.push(tramo);
        continue;
      }
      if (tramo.inicio < bloqueo.inicio) siguientes.push({ inicio: tramo.inicio,
        fin: bloqueo.inicio });
      if (bloqueo.fin < tramo.fin) siguientes.push({ inicio: bloqueo.fin, fin: tramo.fin });
    }
    restantes = siguientes;
  }
  return restantes;
}
