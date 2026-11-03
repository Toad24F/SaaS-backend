import { BadRequestException } from '@nestjs/common';
import { generarCandidatosLibres, redondearInicioLocal } from './candidatos-libres';

const fecha = (valor: string) => new Date(valor);
const espacio = (inicio: string, fin: string) =>
  ({ inicio: fecha(inicio), fin: fecha(fin) });

describe('ALA-T094–T097: candidatos públicos de Agenda Libre', () => {
  it('redondea segundos y minutos locales hacia arriba sin tocar el fin protegido', () => {
    expect(redondearInicioLocal(fecha('2026-07-06T09:20:00.000Z'), 'UTC'))
      .toEqual(fecha('2026-07-06T09:20:00.000Z'));
    expect(redondearInicioLocal(fecha('2026-07-06T09:20:00.001Z'), 'UTC'))
      .toEqual(fecha('2026-07-06T09:25:00.000Z'));
    expect(redondearInicioLocal(fecha('2026-07-06T09:22:00.000Z'), 'UTC'))
      .toEqual(fecha('2026-07-06T09:25:00.000Z'));
    const finProtegido = fecha('2026-07-06T09:42:00.000Z');
    expect(redondearInicioLocal(finProtegido, 'UTC'))
      .toEqual(fecha('2026-07-06T09:45:00.000Z'));
    expect(finProtegido).toEqual(fecha('2026-07-06T09:42:00.000Z'));
  });

  it('omite horas inexistentes y ambiguas en cambios de hora', () => {
    // Nueva York salta 02:00–02:59 en marzo y repite 01:00–01:59 en noviembre.
    expect(redondearInicioLocal(fecha('2026-03-08T06:58:00.000Z'),
      'America/New_York')).toEqual(fecha('2026-03-08T07:00:00.000Z'));
    expect(redondearInicioLocal(fecha('2026-11-01T05:58:00.000Z'),
      'America/New_York')).toEqual(fecha('2026-11-01T07:00:00.000Z'));
  });

  it('conserva la comparación UTC de ocupaciones entre zonas', () => {
    // 09:42 en Chihuahua equivale a 15:42 UTC y abre el hueco a las 09:45 locales.
    const finProtegido = fecha('2026-07-06T15:42:00.000Z');
    expect(redondearInicioLocal(finProtegido, 'America/Chihuahua'))
      .toEqual(fecha('2026-07-06T15:45:00.000Z'));
  });

  it('genera solo inicios locales válidos al cruzar ambas transiciones DST', () => {
    const base = { zonaHoraria: 'America/New_York',
      anticipacionMinutos: 0, diasFuturos: 0 };
    const primavera = generarCandidatosLibres([
      espacio('2026-03-08T06:58:00.000Z', '2026-03-08T07:30:00.000Z')],
    20, 0, { ...base, ahora: fecha('2026-03-08T05:00:00.000Z'),
      desde: '2026-03-08', hasta: '2026-03-08' });
    expect(primavera.map((x) => x.inicioUtc))
      .toEqual([fecha('2026-03-08T07:00:00.000Z')]);
    const otono = generarCandidatosLibres([
      espacio('2026-11-01T05:58:00.000Z', '2026-11-01T07:30:00.000Z')],
    20, 0, { ...base, ahora: fecha('2026-11-01T04:00:00.000Z'),
      desde: '2026-11-01', hasta: '2026-11-01' });
    expect(otono.map((x) => x.inicioUtc))
      .toEqual([fecha('2026-11-01T07:00:00.000Z')]);
  });

  it('avanza desde cada espacio libre por duración más separación', () => {
    const base = { zonaHoraria: 'UTC', ahora: fecha('2026-07-06T08:00:00.000Z'),
      anticipacionMinutos: 0, diasFuturos: 0,
      desde: '2026-07-06', hasta: '2026-07-06' };
    const huecos = [espacio('2026-07-06T09:40:00.000Z', '2026-07-06T10:50:00.000Z')];
    expect(generarCandidatosLibres(huecos, 30, 0, base).map((x) => x.inicioUtc))
      .toEqual([fecha('2026-07-06T09:40:00.000Z'),
        fecha('2026-07-06T10:10:00.000Z')]);
    expect(generarCandidatosLibres(huecos, 32, 0, base).map((x) => x.inicioUtc))
      .toEqual([fecha('2026-07-06T09:40:00.000Z'),
        fecha('2026-07-06T10:15:00.000Z')]);
    expect(generarCandidatosLibres(huecos, 30, 10, base).map((x) => x.inicioUtc))
      .toEqual([fecha('2026-07-06T09:40:00.000Z')]);
  });

  it('aplica anticipación exacta y horizonte inclusivo por fecha local', () => {
    const opciones = { zonaHoraria: 'UTC', ahora: fecha('2026-07-06T09:07:00.000Z'),
      anticipacionMinutos: 15, diasFuturos: 1,
      desde: '2026-07-06', hasta: '2026-07-08' };
    const huecos = [espacio('2026-07-06T09:00:00.000Z', '2026-07-06T10:00:00.000Z'),
      espacio('2026-07-07T09:00:00.000Z', '2026-07-07T09:30:00.000Z'),
      espacio('2026-07-08T09:00:00.000Z', '2026-07-08T09:30:00.000Z')];
    expect(generarCandidatosLibres(huecos, 30, 0, opciones).map((x) => x.inicioUtc))
      .toEqual([fecha('2026-07-06T09:25:00.000Z'),
        fecha('2026-07-07T09:00:00.000Z')]);
  });

  it('admite 31 fechas inclusivas y rechaza la fecha 32', () => {
    const opciones = { zonaHoraria: 'UTC', ahora: fecha('2026-07-01T00:00:00.000Z'),
      anticipacionMinutos: 0, diasFuturos: 60,
      desde: '2026-07-01', hasta: '2026-07-31' };
    expect(generarCandidatosLibres([
      espacio('2026-07-31T09:00:00.000Z', '2026-07-31T09:30:00.000Z')],
    30, 0, opciones)).toHaveLength(1);
    expect(() => generarCandidatosLibres([], 30, 0,
      { ...opciones, hasta: '2026-08-01' })).toThrow(BadRequestException);
  });
});
