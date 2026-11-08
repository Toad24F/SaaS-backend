import { validarClaveOperacionLicencia, validarPlazoSuspension } from './operacion-licencia.dto';

describe('ALA-T028: entrada de operaciones de licencia', () => {
  it('acepta plazo omitido, cero y treinta; rechaza fracciones y fuera de rango', () => {
    expect(validarPlazoSuspension(undefined)).toBe(2);
    expect(validarPlazoSuspension(0)).toBe(0);
    expect(validarPlazoSuspension(30)).toBe(30);
    for (const valor of [-1, 1.5, 31, NaN, '2', null]) {
      expect(() => validarPlazoSuspension(valor)).toThrow();
    }
  });

  it('acepta una clave opaca de 16–64 caracteres y rechaza claves inválidas', () => {
    expect(validarClaveOperacionLicencia('clave-opaca-12345')).toBe('clave-opaca-12345');
    expect(validarClaveOperacionLicencia('a'.repeat(64))).toHaveLength(64);
    for (const valor of ['', 'a'.repeat(15), 'a'.repeat(65), 'con espacios 12345',
      'á'.repeat(16), null, 123]) {
      expect(() => validarClaveOperacionLicencia(valor)).toThrow();
    }
  });
});
