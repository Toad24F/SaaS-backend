import { BadRequestException } from '@nestjs/common';
import { resolverIntervaloLocal, detectarEmpalme, validarRecurrencias } from './calendario';

const franja = (sucursalId: number, diaSemana: number, inicioMinutos: number,
  finMinutos: number, extra = {}) => ({ sucursalId, diaSemana, inicioMinutos,
    finMinutos, orden: 0, activo: true, descansoInicioMinutos: null,
    descansoFinMinutos: null, ...extra });

describe('T087–T089 calendario local', () => {
  it('convierte horas locales de dos zonas a instantes y permite extremos consecutivos', () => {
    const ny = resolverIntervaloLocal('2026-01-12', 'America/New_York', 9 * 60, 10 * 60);
    const la = resolverIntervaloLocal('2026-01-12', 'America/Los_Angeles', 6 * 60, 7 * 60);
    expect(ny?.inicio.toISOString()).toBe('2026-01-12T14:00:00.000Z');
    expect(la?.inicio.toISOString()).toBe(ny?.inicio.toISOString());
    expect(detectarEmpalme([{ ...ny!, fila: 0 },
      { inicio: ny!.fin, fin: new Date(ny!.fin.getTime() + 3600000), fila: 1 }])).toBeNull();
  });

  it('rechaza horas inexistentes, repetidas e intervalos que cruzan el cambio', () => {
    expect(() => resolverIntervaloLocal('2026-03-08', 'America/New_York', 150, 210))
      .toThrow(BadRequestException);
    expect(() => resolverIntervaloLocal('2026-11-01', 'America/New_York', 90, 150))
      .toThrow(BadRequestException);
    expect(() => resolverIntervaloLocal('2026-03-08', 'America/New_York', 90, 210))
      .toThrow(BadRequestException);
    expect(resolverIntervaloLocal('2026-03-08', 'America/New_York', 90, 210,
      'recurrencia')).toBeNull();
    expect(resolverIntervaloLocal('2026-03-15', 'America/New_York', 90, 210,
      'recurrencia')).not.toBeNull();
  });

  it('compara la asignación completa sin descontar el descanso y días locales diferentes', () => {
    const a = resolverIntervaloLocal('2026-01-12', 'Pacific/Honolulu', 23 * 60, 1440)!;
    const b = resolverIntervaloLocal('2026-01-13', 'Pacific/Auckland', 23 * 60, 1440)!;
    expect(detectarEmpalme([{ ...a, fila: 0 }, { ...b, fila: 1 }])).toBeNull();
    const c = resolverIntervaloLocal('2026-01-13', 'UTC', 9 * 60, 10 * 60)!;
    expect(detectarEmpalme([{ ...a, fila: 0 }, { ...c, fila: 1 }])).toEqual([0, 1]);
    const d = resolverIntervaloLocal('2026-01-13', 'UTC', 9 * 60 + 30, 10 * 60 + 30)!;
    expect(detectarEmpalme([{ ...c, fila: 0, descansoInicioMinutos: 9 * 60 + 15,
      descansoFinMinutos: 9 * 60 + 45 }, { ...d, fila: 1 }])).toEqual([0, 1]);
  });

  it('aplica excepción normal o vacía y revisa otras estaciones además de la semana actual', () => {
    const zonas = new Map([[1, 'America/New_York'], [2, 'America/Phoenix']]);
    const semana = [franja(1, 1, 9 * 60, 10 * 60), franja(2, 1, 7 * 60, 8 * 60)];
    // En invierno NY 09:00 = Phoenix 07:00; en verano NY 09:00 = Phoenix 06:00.
    expect(validarRecurrencias(semana, [], zonas, '2026-07-01')).toMatchObject({ filas: [0, 1] });
    const una = [franja(1, 1, 9 * 60, 10 * 60)];
    expect(validarRecurrencias(una, [{ sucursalId: 1, fechaLocal: '2026-01-12',
      franjas: [] }], zonas, '2026-01-12')).toBeNull();
    expect(validarRecurrencias(una, [{ sucursalId: 1, fechaLocal: '2026-01-12',
      franjas: [{ inicioMinutos: 11 * 60, finMinutos: 12 * 60 }] }], zonas,
    '2026-01-12')).toBeNull();
    const sinSemana = [franja(1, 1, 9 * 60, 10 * 60),
      franja(2, 1, 8 * 60, 9 * 60)];
    // NY 11:00 y Phoenix 09:00 coinciden en invierno solo por la excepción.
    expect(validarRecurrencias(sinSemana, [{ sucursalId: 1,
      fechaLocal: '2026-01-12', franjas: [{ inicioMinutos: 11 * 60,
        finMinutos: 12 * 60 }] }], zonas, '2026-01-12')).toBeNull();
    expect(validarRecurrencias(sinSemana, [{ sucursalId: 1,
      fechaLocal: '2026-01-12', franjas: [{ inicioMinutos: 10 * 60,
        finMinutos: 11 * 60 }] }], zonas, '2026-01-12')).toMatchObject({ filas: [1, 2] });
    expect(() => validarRecurrencias([], [{ sucursalId: 1,
      fechaLocal: '2026-11-01', franjas: [{ inicioMinutos: 90,
        finMinutos: 150 }] }], zonas, '2026-11-01')).toThrow(BadRequestException);
  });
});
