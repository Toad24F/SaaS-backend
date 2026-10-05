import { BadRequestException } from '@nestjs/common';
import { intervaloBloqueo, restarRestricciones } from './calculo-bloqueos';
import type { DatosBloqueo } from './validar-bloqueo';

const bloqueo: DatosBloqueo = { personalId: null, sucursalId: null,
  tipo: 'vacaciones', motivo: 'Viaje', fechaInicio: '2026-07-10',
  fechaFin: '2026-07-12', inicioMinutos: 600, finMinutos: 540 };

describe('T106–T107 zonas y unión de restricciones', () => {
  it('interpreta cada sede en su zona y conserva un intervalo multiday continuo', () => {
    const nuevaYork = intervaloBloqueo(bloqueo, 'America/New_York');
    const phoenix = intervaloBloqueo(bloqueo, 'America/Phoenix');
    expect(nuevaYork.inicio.toISOString()).toBe('2026-07-10T14:00:00.000Z');
    expect(nuevaYork.fin.toISOString()).toBe('2026-07-12T13:00:00.000Z');
    expect(phoenix.inicio.toISOString()).toBe('2026-07-10T17:00:00.000Z');
  });

  it('incluye el último día completo y rechaza horas DST inexistentes o repetidas', () => {
    expect(intervaloBloqueo({ ...bloqueo, inicioMinutos: null,
      finMinutos: null }, 'America/New_York').fin.toISOString())
      .toBe('2026-07-13T04:00:00.000Z');
    for (const fecha of ['2026-03-08', '2026-11-01']) {
      expect(() => intervaloBloqueo({ ...bloqueo, fechaInicio: fecha,
        fechaFin: fecha, inicioMinutos: fecha.includes('03-08') ? 150 : 90,
        finMinutos: fecha.includes('03-08') ? 180 : 120 }, 'America/New_York'))
        .toThrow(BadRequestException);
    }
  });

  it('une superposiciones y conserva restricciones de otros bloques al quitar uno', () => {
    const base = [{ inicio: new Date('2026-07-10T14:00:00Z'),
      fin: new Date('2026-07-10T20:00:00Z') }];
    const a = { inicio: new Date('2026-07-10T15:00:00Z'), fin: new Date('2026-07-10T17:00:00Z') };
    const b = { inicio: new Date('2026-07-10T16:00:00Z'), fin: new Date('2026-07-10T18:00:00Z') };
    expect(restarRestricciones(base, [a, b]).map((x) => x.inicio.toISOString()))
      .toEqual(['2026-07-10T14:00:00.000Z', '2026-07-10T18:00:00.000Z']);
    expect(restarRestricciones(base, [b])).toHaveLength(2);
  });
});
