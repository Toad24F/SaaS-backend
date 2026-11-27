import { normalizarTelefonoContacto } from './contacto-persona';
import { destinoWhatsapp } from './telefono-whatsapp';

describe('teléfono internacional de contacto', () => {
  it.each([
    ['6141234567', '6141234567', '+526141234567'],
    ['+52 614-123-4567', '6141234567', '+526141234567'],
    ['+1 202 555 0123', '+12025550123', '+12025550123'],
    ['+1 416 555 0123', '+14165550123', '+14165550123'],
    ['+55 11 98765 4321', '+5511987654321', '+5511987654321'],
    ['+57 300 123 4567', '+573001234567', '+573001234567'],
  ])('normaliza %s y prepara el destino de Meta', (entrada, guardado, destino) => {
    expect(normalizarTelefonoContacto(entrada)).toBe(guardado);
    expect(destinoWhatsapp(guardado)).toBe(destino);
  });

  it.each(['+44 20 1234 5678', '+1 202 555 012', '+1 202 555 0123 ext. 4',
    '+999 123456789', '614abc4567'])('rechaza %s', (entrada) => {
    expect(() => normalizarTelefonoContacto(entrada)).toThrow(/tel[eé]fono/i);
  });
});
