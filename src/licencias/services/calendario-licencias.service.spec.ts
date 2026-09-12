import { CalendarioLicenciasService } from './calendario-licencias.service';

describe('Calendario de licencias en Chihuahua (T21)', () => {
  const calendario = new CalendarioLicenciasService();

  it('suma un aniversario conservando fecha y hora local', () => {
    expect(calendario.sumarAnios(new Date('2026-06-15T18:30:45.123Z'), 1).toISOString())
      .toBe('2027-06-15T18:30:45.123Z');
  });

  it('ajusta el 29 de febrero al último día del mes de destino', () => {
    expect(calendario.sumarAnios(new Date('2028-02-29T18:00:00.000Z'), 1).toISOString())
      .toBe('2029-02-28T18:00:00.000Z');
  });

  it('conserva un aniversario ubicado al final de mes', () => {
    expect(calendario.sumarAnios(new Date('2026-01-31T18:15:00.000Z'), 1).toISOString())
      .toBe('2027-01-31T18:15:00.000Z');
  });

  it('usa reglas históricas de zona y no un offset fijo', () => {
    expect(calendario.sumarAnios(new Date('2021-12-15T19:00:00.000Z'), 1).toISOString())
      .toBe('2022-12-15T18:00:00.000Z');
  });

  it('acumula renovaciones desde cada vencimiento base sin usar 365 días', () => {
    const primera = calendario.sumarAnios(new Date('2027-02-28T18:00:00.000Z'), 1);
    const segunda = calendario.sumarAnios(primera, 1);
    expect(primera.toISOString()).toBe('2028-02-28T18:00:00.000Z');
    expect(segunda.toISOString()).toBe('2029-02-28T18:00:00.000Z');
  });
});
