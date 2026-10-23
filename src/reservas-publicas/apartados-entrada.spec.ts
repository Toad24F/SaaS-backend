import { validarSolicitudApartado } from './apartados-entrada';

describe('M3-T058: entrada de apartado', () => {
  const seleccion = { clave: 'operacion_1234567890', personalId: 1,
    sucursalId: 2, servicioId: 3, fechaLocal: '2026-10-20', horaInicio: '08:30' };

  it('acepta solo selección y clave opaca; normaliza la huella de contenido', () => {
    const primera = validarSolicitudApartado(seleccion);
    expect(primera.clave).toBe(seleccion.clave);
    expect(primera.seleccionHash).toMatch(/^[a-f0-9]{64}$/);
    expect(validarSolicitudApartado({ ...seleccion, clave: 'otra_operacion_123' })
      .seleccionHash).toBe(primera.seleccionHash);
    expect(validarSolicitudApartado({ ...seleccion, servicioId: 4 })
      .seleccionHash).not.toBe(primera.seleccionHash);
  });

  it.each(['costo', 'finUtc', 'titularHash', 'negocioId', 'generacion'])(
    'rechaza el campo ajeno %s', (campo) => {
      expect(() => validarSolicitudApartado({ ...seleccion, [campo]: 'ajeno' }))
        .toThrow();
    });

  it('rechaza clave, IDs, fecha y hora inválidos', () => {
    for (const cambio of [{ clave: 'x' }, { personalId: 0 },
      { sucursalId: 1.5 }, { fechaLocal: '2026-02-30' },
      { horaInicio: '24:00' }]) {
      expect(() => validarSolicitudApartado({ ...seleccion, ...cambio })).toThrow();
    }
  });
});
