import { calcularVencimientoConfirmacion, calcularRecordatorio } from './politica-temporal';

const base = new Date('2026-11-23T12:00:00.000Z');
const sumar = (milisegundos: number) => new Date(base.getTime() + milisegundos);
const hora = 3_600_000;

describe('M5-T065: vencimiento de confirmación', () => {
  it('distingue seis horas con precisión de milisegundos', () => {
    expect(calcularVencimientoConfirmacion(base, sumar(6 * hora + 1), 12).categoria).toBe('normal');
    expect(calcularVencimientoConfirmacion(base, sumar(6 * hora), 12).categoria).toBe('proxima');
    expect(calcularVencimientoConfirmacion(base, sumar(6 * hora - 1), 12).categoria).toBe('proxima');
  });

  it('aplica el plazo ordinario y lo corta una hora antes del inicio', () => {
    expect(calcularVencimientoConfirmacion(base, sumar(24 * hora), 12).vencimientoUtc)
      .toEqual(sumar(12 * hora));
    expect(calcularVencimientoConfirmacion(base, sumar(7 * hora), 12).vencimientoUtc)
      .toEqual(sumar(6 * hora));
  });

  it('da quince minutos solo cuando vencen estrictamente antes del inicio', () => {
    expect(calcularVencimientoConfirmacion(base, sumar(16 * 60_000), 12).vencimientoUtc)
      .toEqual(sumar(15 * 60_000));
    expect(calcularVencimientoConfirmacion(base, sumar(15 * 60_000), 12).vencimientoUtc).toBeNull();
    expect(calcularVencimientoConfirmacion(base, sumar(15 * 60_000 - 1), 12).vencimientoUtc).toBeNull();
  });
});

describe('M5-T066: elegibilidad del recordatorio', () => {
  it('omite citas próximas y un instante programado igual o anterior al alta', () => {
    expect(calcularRecordatorio(base, sumar(30 * hora), 24, true)).toBeNull();
    expect(calcularRecordatorio(base, sumar(24 * hora), 24, false)).toBeNull();
    expect(calcularRecordatorio(base, sumar(24 * hora - 1), 24, false)).toBeNull();
  });

  it.each([12, 24, 48])('admite %i horas cuando el instante futuro es útil', (anticipacion) => {
    expect(calcularRecordatorio(base, sumar((anticipacion + 1) * hora), anticipacion, false))
      .toEqual(sumar(hora));
  });
});
