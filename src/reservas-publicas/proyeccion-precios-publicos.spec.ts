import { proyectarPreciosPublicos } from './proyeccion-precios-publicos';

describe('ALA-T077: proyección pública de importes', () => {
  it('omite importes anidados sin sustituirlos ni mutar la historia interna', () => {
    const historico = Object.freeze({ folio: 'ABC', costoAceptado: '100.00',
      resumen: Object.freeze({ estado: 'pendiente', precio: '100.00',
        servicio: Object.freeze({ nombre: 'Consulta', costo: '100.00' }) }),
      opciones: Object.freeze([Object.freeze({ nombre: 'Uno', importe: '10.00' }),
        Object.freeze({ nombre: 'Dos', total: '20.00' })]),
      cantidadServicios: 2 });
    const oculto = proyectarPreciosPublicos(historico, false);
    expect(oculto).toEqual({ folio: 'ABC', resumen: { estado: 'pendiente',
      servicio: { nombre: 'Consulta' } },
    opciones: [{ nombre: 'Uno' }, { nombre: 'Dos' }], cantidadServicios: 2 });
    expect(JSON.stringify(oculto)).not.toMatch(/costo|precio|importe|"total"/i);
    expect(historico.costoAceptado).toBe('100.00');
    expect(historico.resumen.servicio.costo).toBe('100.00');
    expect(proyectarPreciosPublicos(historico, true)).toEqual(historico);
  });
});
