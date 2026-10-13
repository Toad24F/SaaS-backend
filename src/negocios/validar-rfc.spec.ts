import { esFormatoRfcValido } from './validar-rfc';

describe('formato de RFC', () => {
  it.each(['ABC010101AB1', 'XEXT990101NI1'])('acepta RFC de 12 o 13 caracteres: %s', (rfc) => {
    expect(esFormatoRfcValido(rfc)).toBe(true);
  });

  it.each(['ABC010101AB', 'ABC010101AB12', 'AB1010101AB1', 'ABC000000AB1', 'ABC013201AB1'])
    ('rechaza RFC con estructura inválida: %s', (rfc) => {
      expect(esFormatoRfcValido(rfc)).toBe(false);
    });
});
