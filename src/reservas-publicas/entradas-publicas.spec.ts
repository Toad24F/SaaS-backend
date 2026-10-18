import { validarCatalogoPublico, validarDisponibilidadPublica } from './entradas-publicas';

describe('M3-T038–T039: entradas públicas estrictas', () => {
  it('admite filtros progresivos y rechaza identidades o campos ajenos', () => {
    expect(validarCatalogoPublico({})).toEqual({});
    expect(validarCatalogoPublico({ servicioId: '7', sucursalId: '9' }))
      .toEqual({ servicioId: 7, sucursalId: 9 });
    expect(() => validarCatalogoPublico({ sucursalId: '9' })).toThrow();
    for (const entrada of [{ negocioId: '1' }, { servicioId: '0' },
      { servicioId: ['1', '2'] }, { titularHash: 'x' }]) {
      expect(() => validarCatalogoPublico(entrada)).toThrow();
    }
  });

  it('acepta 31 fechas inclusivas y rechaza 32, manual y exclusiones', () => {
    const base = { personalId: '1', sucursalId: '2', servicioId: '3',
      desde: '2026-10-01', hasta: '2026-10-31' };
    expect(validarDisponibilidadPublica(base)).toEqual({ personalId: 1,
      sucursalId: 2, servicioId: 3, desde: base.desde, hasta: base.hasta });
    for (const entrada of [{ ...base, hasta: '2026-11-01' },
      { ...base, modalidad: 'manual' }, { ...base, negocioId: '1' },
      { ...base, titularHash: 'x' }, { ...base, excluirApartadoId: '1' },
      { ...base, horaInicio: '10:00' }, { ...base, desde: '2026-02-30' },
      { ...base, personalId: '0' }, { ...base, desde: '2026-11-01' }]) {
      expect(() => validarDisponibilidadPublica(entrada)).toThrow();
    }
  });
});
