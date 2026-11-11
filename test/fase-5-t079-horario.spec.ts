import { validarCambioHorario } from '../src/citas/cambio-horario.entrada';

/** El formulario solo propone pared local y versión; nunca controla el intervalo ni la oferta. */
describe('M4-T079: entrada cerrada de movimiento', () => {
  it('acepta fecha civil, hora de minuto y versión entera', () => {
    expect(validarCambioHorario({ fechaLocal: '2026-11-09', horaInicio: '09:20', version: 1 }))
      .toEqual({ fechaLocal: '2026-11-09', horaInicio: '09:20', version: 1 });
  });
  it.each([null, [], {},
    ...['2026-02-30', '09-11-2026', 4].map(fechaLocal => ({ fechaLocal, horaInicio: '09:20', version: 1 })),
    ...['24:00', '9:20', '09:20:00', null].map(horaInicio => ({ fechaLocal: '2026-11-09', horaInicio, version: 1 })),
    ...[0, -1, 1.5, '1', 4294967296].map(version => ({ fechaLocal: '2026-11-09', horaInicio: '09:20', version })),
    ...['negocioId', 'citaId', 'servicioId', 'sucursalId', 'personalId', 'precio', 'finUtc', 'zonaHoraria', 'excluirCitaId']
      .map(campo => ({ fechaLocal: '2026-11-09', horaInicio: '09:20', version: 1, [campo]: 1 }))])
    ('rechaza entrada inválida %#', entrada => {
      expect(() => validarCambioHorario(entrada)).toThrow(expect.objectContaining({ status: 400 }));
    });
});
