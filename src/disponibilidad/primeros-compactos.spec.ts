import { seleccionarPrimerosCompactos } from './primeros-compactos';

const inicio = (fecha: string, hora: string) => new Date(`${fecha}T${hora}:00.000Z`);
const ranura = (fecha: string, hora: string) => ({
  inicioUtc: inicio(fecha, hora), finUtc: new Date(inicio(fecha, hora).getTime() + 1800000),
});

describe('ALA-T098: primer inicio compacto por fecha local', () => {
  it('elige solo la mañana aunque exista atención posterior y conserva otro día', () => {
    const opciones = [ranura('2026-10-20', '14:00'), ranura('2026-10-21', '14:00'),
      ranura('2026-10-20', '09:00'), ranura('2026-10-21', '09:00')];
    expect(seleccionarPrimerosCompactos(opciones, 'UTC'))
      .toEqual([opciones[2], opciones[3]]);
  });

  it('agrupa por fecha de la sucursal y compara instantes UTC', () => {
    // 01:00 UTC del miércoles aún es martes en Chihuahua.
    const opciones = [ranura('2026-10-21', '01:00'),
      ranura('2026-10-20', '16:00'), ranura('2026-10-21', '15:00')];
    expect(seleccionarPrimerosCompactos(opciones, 'America/Chihuahua'))
      .toEqual([opciones[1], opciones[2]]);
  });

  it('un conjunto sin candidatos produce ausencia legítima', () => {
    expect(seleccionarPrimerosCompactos([], 'UTC')).toEqual([]);
  });
});
