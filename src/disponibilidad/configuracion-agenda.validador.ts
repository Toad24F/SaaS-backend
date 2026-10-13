import { BadRequestException } from '@nestjs/common';

export interface ValoresConfiguracionAgenda {
  modo: 'ventana_libre' | 'agenda_compacta';
  intervaloMinutos: 5 | 10 | 15 | 20 | 30 | 60;
  anticipacionMinutos: number;
  diasFuturos: number;
}

export const CONFIGURACION_INICIAL: Readonly<ValoresConfiguracionAgenda> = Object.freeze({
  modo: 'ventana_libre', intervaloMinutos: 15, anticipacionMinutos: 15, diasFuturos: 60,
});

const CAMPOS = ['modo', 'intervaloMinutos', 'anticipacionMinutos', 'diasFuturos'];
const ENTERO_SQL = 4_294_967_295;
const INTERVALOS = [5, 10, 15, 20, 30, 60];

/** Valida el reemplazo íntegro antes de abrir la transacción o tocar auditoría. */
export function validarConfiguracionAgenda(entrada: unknown): ValoresConfiguracionAgenda {
  if (entrada === null || typeof entrada !== 'object' || Array.isArray(entrada)) {
    throw new BadRequestException('La configuración de agenda debe ser un objeto completo.');
  }
  const datos = entrada as Record<string, unknown>;
  const afectados = new Set<string>();
  for (const campo of CAMPOS) if (!Object.hasOwn(datos, campo)) afectados.add(campo);
  for (const campo of Object.keys(datos)) if (!CAMPOS.includes(campo)) afectados.add(campo);
  if (datos.modo !== 'ventana_libre' && datos.modo !== 'agenda_compacta') afectados.add('modo');
  if (!INTERVALOS.includes(datos.intervaloMinutos as number)) afectados.add('intervaloMinutos');
  // SQL usa INT UNSIGNED; exigir enteros seguros impide redondeos y conversiones implícitas.
  if (typeof datos.anticipacionMinutos !== 'number' ||
    !Number.isSafeInteger(datos.anticipacionMinutos) || datos.anticipacionMinutos < 0 ||
    datos.anticipacionMinutos > ENTERO_SQL || datos.anticipacionMinutos % 5 !== 0 ||
    Date.now() + datos.anticipacionMinutos * 60_000 > Date.UTC(9999, 11, 31)) {
    afectados.add('anticipacionMinutos');
  }
  if (typeof datos.diasFuturos !== 'number' || !Number.isSafeInteger(datos.diasFuturos) ||
    datos.diasFuturos < 0 || datos.diasFuturos > ENTERO_SQL ||
    Date.now() + datos.diasFuturos * 86_400_000 > Date.UTC(9999, 11, 31)) {
    afectados.add('diasFuturos');
  }
  if (afectados.size) throw new BadRequestException(
    `Configuración de agenda inválida: ${[...afectados].join(', ')}.`);
  return { modo: datos.modo as ValoresConfiguracionAgenda['modo'],
    intervaloMinutos: datos.intervaloMinutos as ValoresConfiguracionAgenda['intervaloMinutos'],
    anticipacionMinutos: datos.anticipacionMinutos as number,
    diasFuturos: datos.diasFuturos as number };
}
