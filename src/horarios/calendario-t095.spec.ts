import { detectarEmpalme, resolverIntervaloLocal,
  validarRecurrencias } from './calendario';

const semanal = (diaSemana: number, sucursalId: number, inicioMinutos: number,
  finMinutos: number, extra = {}) => ({ diaSemana, sucursalId, inicioMinutos,
    finMinutos, orden: 0, descansoInicioMinutos: null,
    descansoFinMinutos: null, activo: true, ...extra });

describe('T095 — sucursales, medianoche y días locales distintos', () => {
  it('detecta lunes en Honolulu y martes en Auckland que coinciden en UTC', () => {
    const zonas = new Map([[1, 'Pacific/Honolulu'], [2, 'Pacific/Auckland']]);
    expect(validarRecurrencias([
      semanal(1, 1, 1380, 1440), semanal(2, 2, 1320, 1380),
    ], [], zonas, '2026-01-01')).toMatchObject({ filas: [0, 1] });
    // El día local termina exactamente a 24:00 y no invade el siguiente.
    expect(validarRecurrencias([
      semanal(1, 1, 1380, 1440), semanal(2, 2, 1380, 1440),
    ], [], zonas, '2026-01-01')).toBeNull();
  });

  it('admite franjas consecutivas entre sucursales y hueco de comida', () => {
    const zonas = new Map([[1, 'America/New_York'], [2, 'America/Phoenix']]);
    expect(validarRecurrencias([
      semanal(1, 1, 540, 600), semanal(1, 2, 480, 540),
    ], [], zonas, '2026-01-01')).toBeNull();
    expect(validarRecurrencias([
      semanal(1, 1, 540, 600), semanal(1, 2, 540, 600),
    ], [], zonas, '2026-01-01')).toBeNull();
    const a = resolverIntervaloLocal('2026-01-12', 'UTC', 540, 600)!;
    const b = resolverIntervaloLocal('2026-01-12', 'UTC', 570, 630)!;
    // El descanso interno conserva ocupada la franja completa.
    expect(detectarEmpalme([{ ...a, fila: 0 }, { ...b, fila: 1 }])).toEqual([0, 1]);
  });

  it('la excepción vacía elimina solo su fecha y sucursal', () => {
    const zonas = new Map([[1, 'UTC'], [2, 'UTC']]);
    const semana = [semanal(1, 1, 540, 600), semanal(1, 2, 570, 630)];
    expect(validarRecurrencias(semana, [], zonas, '2026-01-12')).toMatchObject({
      filas: [0, 1],
    });
    // En la fecha concreta se suprime una fila, pero las otras semanas siguen.
    expect(validarRecurrencias(semana, [{ sucursalId: 1,
      fechaLocal: '2026-01-12', franjas: [] }], zonas, '2026-01-12'))
      .toMatchObject({ filas: [0, 1] });
    expect(validarRecurrencias([semana[0]], [{ sucursalId: 1,
      fechaLocal: '2026-01-12', franjas: [] }], zonas, '2026-01-12')).toBeNull();
  });
});
