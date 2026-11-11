import { validarSeleccionManual, validarClaveManual, huellaSeleccionManual } from '../src/citas/seleccion-manual.entrada';
import { IntentosCitaManualService } from '../src/citas/intentos-cita-manual.service';

const base = { clienteNuevo: { nombreCompleto: ' Ana ', telefono: '+52 614-123-4567' },
  sucursalId: 1, personalId: 2, servicioId: 3, fechaLocal: '2026-11-09', horaInicio: '09:17' };

describe('M4-T048: contrato cerrado de selección manual', () => {
  it('rechaza entrada inválida antes de abrir una transacción o consultar datos', async () => {
    const acceso = { ejecutar: jest.fn() };
    const manual = new IntentosCitaManualService(acceso as never, {} as never, {} as never, {} as never);
    const actor = { sub: 1, sesionId: 'sesion' };
    await expect(manual.preparar(actor, 'a'.repeat(16), { ...base, negocioId: 1 })).rejects.toMatchObject({ status: 400 });
    await expect(manual.conSeleccionRevalidada(actor, 'a'.repeat(16), {}, jest.fn())).rejects.toMatchObject({ status: 400 });
    expect(acceso.ejecutar).not.toHaveBeenCalled();
  });
  it('normaliza cliente nuevo y notas, conserva minutos manuales sin estrategia pública', () => {
    expect(validarSeleccionManual({ ...base, notas: ' Nota ' })).toEqual({ ...base,
      clienteNuevo: { nombreCompleto: 'Ana', telefono: '6141234567' }, notas: 'Nota' });
    const { clienteNuevo: _, ...seleccion } = base;
    expect(validarSeleccionManual({ ...seleccion, clienteId: 4 })).toEqual({ ...seleccion, clienteId: 4, notas: null });
  });
  it.each(['negocioId', 'costo', 'precio', 'finUtc', 'zonaHoraria', 'modalidad', 'apartadoPropio', 'estado', 'excluirCitaId'])
    ('rechaza autoridad del navegador en %s', (campo) => {
      expect(() => validarSeleccionManual({ ...base, [campo]: 1 })).toThrow();
    });
  it.each([null, [], {}, { ...base, clienteNuevo: null }, { ...base, clienteId: 4 },
    { ...base, clienteNuevo: { ...base.clienteNuevo, negocioId: 1 } },
    { ...base, clienteNuevo: { nombreCompleto: '', telefono: '6141234567' } },
    { ...base, clienteNuevo: { nombreCompleto: 'Ana', telefono: '123' } },
    { ...base, sucursalId: '1' }, { ...base, personalId: 0 }, { ...base, servicioId: 4294967296 },
    { ...base, fechaLocal: '2026-02-30' }, { ...base, horaInicio: '24:00' },
    { ...base, horaInicio: '09:00:00' }, { ...base, notas: 5 }, { ...base, notas: 'a'.repeat(2001) }])
    ('rechaza selección inválida %j', (entrada) => expect(() => validarSeleccionManual(entrada)).toThrow());
  it('limita notas por caracteres y mantiene nulo el campo vacío', () => {
    expect(validarSeleccionManual({ ...base, notas: '😀'.repeat(2000) }).notas).toHaveLength(4000);
    expect(validarSeleccionManual({ ...base, notas: '  ' }).notas).toBeNull();
  });
  it.each(['', 'corta', ' '.repeat(16), 'a'.repeat(65), 'á'.repeat(16), null])
    ('rechaza clave no opaca %j', (clave) => expect(() => validarClaveManual(clave)).toThrow());
  it('huella canónica con secreto: orden y formato equivalentes repiten; contenido distinto no', () => {
    const secreto = 'clave-aislada-suficientemente-larga-para-tests';
    const entrada = validarSeleccionManual(base);
    const equivalente = validarSeleccionManual({ notas: null, ...base,
      clienteNuevo: { telefono: '6141234567', nombreCompleto: 'Ana' } });
    expect(validarClaveManual('a'.repeat(16))).toBe('a'.repeat(16));
    const huella = huellaSeleccionManual(entrada, secreto);
    expect(huella).toMatch(/^[a-f0-9]{64}$/);
    expect(huellaSeleccionManual(equivalente, secreto)).toBe(huella);
    expect(huellaSeleccionManual({ ...entrada, notas: 'Cambio' }, secreto)).not.toBe(huella);
    expect(huellaSeleccionManual(entrada, secreto + 'otro')).not.toBe(huella);
    expect(() => huellaSeleccionManual(entrada, '')).toThrow();
  });
});
