import { claveCompartidaIntentos } from './limite-intentos.guard';

describe('LimiteIntentosGuard (T27)', () => {
  it('produce la misma clave IP para login y validación de códigos', () => {
    const ip = '2001:db8::25';
    const claveLogin = claveCompartidaIntentos(ip);
    const claveValidacionCodigo = claveCompartidaIntentos(ip);

    expect(claveLogin).toBe(ip);
    expect(claveValidacionCodigo).toBe(claveLogin);
  });
});
