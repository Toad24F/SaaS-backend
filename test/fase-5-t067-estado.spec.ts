import { validarCambioEstado } from '../src/citas/cambio-estado.entrada';

describe('M4-T067: entrada cerrada de cambio de estado', () => {
  it.each(['pendiente', 'confirmada', 'completada', 'cancelada', 'no_asistio'])('acepta únicamente estado %s con versión entera', (estado) => {
    expect(validarCambioEstado({ estado, version: 1 })).toEqual({ estado, version: 1, motivo: null });
  });

  it('normaliza motivo opcional sin confundir caracteres Unicode con unidades UTF-16', () => {
    expect(validarCambioEstado({ estado: 'cancelada', version: 4294967295, motivo: '  Cambio solicitado\npor la persona  ' }))
      .toEqual({ estado: 'cancelada', version: 4294967295, motivo: 'Cambio solicitado\npor la persona' });
    for (const motivo of [undefined, null, '', '   ']) expect(validarCambioEstado({ estado: 'no_asistio', version: 2, motivo }).motivo).toBeNull();
    expect(validarCambioEstado({ estado: 'cancelada', version: 1, motivo: '🙂'.repeat(2000) }).motivo).toHaveLength(4000);
  });

  // La versión observada nunca se toma de coerciones ni el formulario puede modificar otros campos de la cita.
  it.each([null, [], 'confirmada', {}, { estado: 'confirmada' }, { version: 1 },
    ...['Confirmada', 'no asistio', '', 1, null].map((estado) => ({ estado, version: 1 })),
    ...[0, -1, 1.2, '1', null, NaN, Infinity, 4294967296].map((version) => ({ estado: 'confirmada', version })),
    ...[7, [], {}, '🙂'.repeat(2001)].map((motivo) => ({ estado: 'cancelada', version: 1, motivo })),
    ...['negocioId', 'actorId', 'clienteId', 'inicioUtc', 'precio', 'folio', 'estadoAnterior'].map((campo) => ({ estado: 'confirmada', version: 1, [campo]: 1 }))])
    ('rechaza entrada inválida %# sin coerción ni campos desconocidos', (entrada) => {
      expect(() => validarCambioEstado(entrada)).toThrow(expect.objectContaining({ status: 400 }));
    });
});
