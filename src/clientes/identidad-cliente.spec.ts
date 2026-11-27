import { normalizarIdentidadCliente, normalizarNombreCliente } from './identidad-cliente';

describe('M5-T008: identidad compartida de clientes', () => {
  it('iguala NFC, mayúsculas, espacios Unicode y formato mexicano', () => {
    expect(normalizarIdentidadCliente('  JOSE\u0301\u0085\u00a0  NUN\u0303EZ ', '+52 614-000-0001'))
      .toEqual({ nombreNormalizado: 'josé nuñez', telefono: '6140000001' });
    expect(normalizarNombreCliente('José Nuñez')).toBe('josé nuñez');
  });

  // Conservar distinciones que se pierden con una colación insensible a acentos o con NFKC.
  it.each([['José', 'Jose'], ['Peña', 'Pena'], ['Ana-María', 'Ana María'], ['Ａna', 'Ana']])(
    'mantiene diferentes %s y %s', (a, b) => {
      expect(normalizarNombreCliente(a)).not.toBe(normalizarNombreCliente(b));
    },
  );

  it('devuelve NFC después de pasar a minúsculas y valida el contacto', () => {
    expect(normalizarNombreCliente('İ')).toBe('i\u0307');
    expect(normalizarIdentidadCliente('Ana', '0000000001').telefono).toBe('0000000001');
    expect(() => normalizarIdentidadCliente('\u0085\u0085', '0000000001')).toThrow('nombre');
    expect(() => normalizarIdentidadCliente('Ana\ud800', '0000000001')).toThrow('nombre');
    expect(() => normalizarIdentidadCliente('Ana', '123')).toThrow('teléfono');
  });
});
