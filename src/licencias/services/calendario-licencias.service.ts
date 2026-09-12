import { BadRequestException, Injectable } from '@nestjs/common';

const ZONA_CHIHUAHUA = 'America/Chihuahua';

interface PartesLocales {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** Opera aniversarios locales y devuelve instantes UTC para persistencia. */
@Injectable()
export class CalendarioLicenciasService {
  private readonly formato = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONA_CHIHUAHUA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

  sumarAnios(baseUtc: Date, cantidad = 1): Date {
    if (!Number.isInteger(cantidad) || cantidad < 1 || !Number.isFinite(baseUtc.getTime())) {
      throw new BadRequestException('La fecha y la cantidad de años deben ser válidas.');
    }
    const origen = this.partes(baseUtc);
    const year = origen.year + cantidad;
    const ultimoDia = new Date(Date.UTC(year, origen.month, 0)).getUTCDate();
    const objetivo: PartesLocales = {
      ...origen,
      year,
      day: Math.min(origen.day, ultimoDia),
    };
    const objetivoComparable = this.comoUtc(objetivo);
    let candidato = objetivoComparable;

    // Recalcular con Intl incorpora las reglas históricas/reales de la zona.
    for (let intento = 0; intento < 4; intento += 1) {
      const diferencia = objetivoComparable - this.comoUtc(
        this.partes(new Date(candidato)),
      );
      candidato += diferencia;
      if (diferencia === 0) {
        return new Date(candidato + baseUtc.getUTCMilliseconds());
      }
    }
    throw new BadRequestException('No fue posible resolver el aniversario en Chihuahua.');
  }

  private partes(fecha: Date): PartesLocales {
    const valores = Object.fromEntries(
      this.formato.formatToParts(fecha)
        .filter(({ type }) => type !== 'literal')
        .map(({ type, value }) => [type, Number(value)]),
    ) as unknown as PartesLocales;
    return valores;
  }

  private comoUtc(partes: PartesLocales): number {
    return Date.UTC(
      partes.year,
      partes.month - 1,
      partes.day,
      partes.hour,
      partes.minute,
      partes.second,
    );
  }
}
