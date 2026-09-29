import { DerivadorCodigo } from './derivador-codigo';

describe('M1-T022: derivación reproducible y claves versionadas', () => {
  const derivador = new DerivadorCodigo({ 1: 'clave-larga-de-prueba-separada-del-jwt-123456' }, 1);
  const base = {
    emisionId: '11111111-1111-4111-8111-111111111111', nonce: 'a'.repeat(32),
    proposito: 'activacion_admin', negocioId: 4, destinatarioTipo: 'alta',
    destinatarioId: 7, destinatarioVersion: 1, correo: 'admin@example.test', claveVersion: 1,
  } as const;

  it('reproduce la misma emisión y cambia con nonce, propósito o destinatario', () => {
    // La clave permanece fuera de la BD; el nonce y los identificadores sí se guardan.
    const codigo = derivador.derivar(base);
    expect(derivador.derivar(base)).toBe(codigo);
    expect(derivador.derivar({ ...base, nonce: 'b'.repeat(32) })).not.toBe(codigo);
    expect(derivador.derivar({ ...base, proposito: 'recuperacion' })).not.toBe(codigo);
    expect(derivador.derivar({ ...base, destinatarioId: 8 })).not.toBe(codigo);
    expect(derivador.derivar({ ...base, destinatarioVersion: 2 })).not.toBe(codigo);
    expect(derivador.hash(codigo)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rechaza una versión sin clave en vez de reconstruir un código incorrecto', () => {
    expect(() => derivador.derivar({ ...base, claveVersion: 2 })).toThrow();
  });

  it('conserva códigos de la versión anterior durante una rotación', () => {
    const rotado = new DerivadorCodigo({
      1: 'clave-larga-de-prueba-separada-del-jwt-123456',
      2: 'otra-clave-de-prueba-independiente-654321',
    }, 2);
    expect(rotado.derivar(base)).toBe(derivador.derivar(base));
    expect(rotado.derivar({ ...base, claveVersion: 2 })).not.toBe(derivador.derivar(base));
  });

  it('rechaza una configuración de claves mal formada', () => {
    const anterior = process.env.CODIGOS_HMAC_CLAVES;
    try {
      process.env.CODIGOS_HMAC_CLAVES = 'no-es-json';
      expect(() => new DerivadorCodigo()).toThrow();
    } finally {
      if (anterior === undefined) delete process.env.CODIGOS_HMAC_CLAVES;
      else process.env.CODIGOS_HMAC_CLAVES = anterior;
    }
  });
});
