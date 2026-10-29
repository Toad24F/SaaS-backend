import { validarContactoReservaPublica, huellaContactoReservaPublica } from './contacto-reserva-publica';

describe('M3-T069–T071: contacto y huella del envío', () => {
  // Los límites se comprueban tras recortar extremos, sin modificar el texto interior.
  const valido = { nombre: '  María José  ', telefono: '+52 614-123-4567', notas: '  Consulta  ' };

  it('normaliza nombre, teléfono y notas sin interpretar HTML', () => {
    expect(validarContactoReservaPublica(valido)).toEqual({ nombre: 'María José',
      telefono: '6141234567', notas: 'Consulta' });
    expect(validarContactoReservaPublica({ nombre: 'Á'.repeat(150),
      telefono: '614 123 4567', notas: '<b>x</b>' + 'a'.repeat(1992) }))
      .toMatchObject({ nombre: 'Á'.repeat(150), telefono: '6141234567' });
    expect(validarContactoReservaPublica({ nombre: 'Ana', telefono: '6141234567',
      notas: ' ' }).notas).toBeNull();
  });

  it.each([{ nombre: '', telefono: '6141234567', campo: 'nombre' },
    { nombre: 'a'.repeat(151), telefono: '6141234567', campo: 'nombre' },
    { nombre: 'Ana', telefono: '614123456', campo: 'telefono' },
    { nombre: 'Ana', telefono: '+1 6141234567', campo: 'telefono' },
    { nombre: 'Ana', telefono: '614abc4567', campo: 'telefono' },
    { nombre: 'Ana', telefono: '6141234567', notas: 'a'.repeat(2001), campo: 'notas' }])(
    'rechaza el campo $campo', ({ campo, ...entrada }) => {
      const esperado = campo === 'telefono' ? /tel[eé]fono/i : new RegExp(campo, 'i');
      expect(() => validarContactoReservaPublica(entrada)).toThrow(esperado);
    });

  it('rechaza campos ajenos y más de 32 KiB sin truncar', () => {
    expect(() => validarContactoReservaPublica({ ...valido, codigo: '1234' })).toThrow();
    expect(() => validarContactoReservaPublica({ ...valido,
      notas: 'ñ'.repeat(20_000) })).toThrow(/32 KiB/);
  });

  it('produce HMAC estable para datos equivalentes y separa secretos', () => {
    const a = validarContactoReservaPublica(valido);
    const b = validarContactoReservaPublica({ nombre: 'María José',
      telefono: '6141234567', notas: 'Consulta' });
    const uno = huellaContactoReservaPublica(a, 'secreto-aislado-de-pruebas-1234567890');
    expect(uno).toMatch(/^[a-f0-9]{64}$/);
    expect(huellaContactoReservaPublica(b, 'secreto-aislado-de-pruebas-1234567890'))
      .toBe(uno);
    expect(huellaContactoReservaPublica(b, 'otro-secreto-aislado-de-pruebas-1234567890'))
      .not.toBe(uno);
    expect(uno).not.toContain('6141234567');
    expect(() => huellaContactoReservaPublica(a, '')).toThrow(/configurado/i);
  });
});
