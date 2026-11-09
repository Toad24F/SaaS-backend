import { validarIdCita, validarPaginacionHistorial, validarDetalleCita } from '../src/citas/consulta-cita.entrada';
import { ConsultaAgendaService } from '../src/citas/consulta-agenda.service';
import type { AccesoOperativoService } from '../src/citas/acceso-operativo.service';
import type { CitasAfectadasService } from '../src/disponibilidad/citas-afectadas.service';

function sinAcceso() {
  const acceso = { ejecutar: jest.fn() };
  return { acceso, agenda: new ConsultaAgendaService(acceso as unknown as AccesoOperativoService, {} as CitasAfectadasService) };
}

describe('M4-T032/T033: entradas de detalle e historial', () => {
  it('acepta ID unsigned y páginas limitadas, sin filtros arbitrarios', () => {
    expect(validarIdCita('4294967295')).toBe(4294967295);
    expect(validarDetalleCita({})).toBeUndefined();
    expect(validarPaginacionHistorial({})).toEqual({ pagina: 1, limite: 50 });
    expect(validarPaginacionHistorial({ pagina: '2', limite: '100' })).toEqual({ pagina: 2, limite: 100 });
  });
  it.each(['0', '-1', '01', '1.5', '1 OR 1=1', '4294967296', '', 1, null, ['1']])('rechaza ID %j', async (id) => {
    expect(() => validarIdCita(id)).toThrow('Entrada operativa inválida.');
    const f = sinAcceso();
    await expect(f.agenda.detalle({ sub: 1, sesionId: 'sesion' }, id, {})).rejects.toMatchObject({ status: 400 });
    await expect(f.agenda.historial({ sub: 1, sesionId: 'sesion' }, id, {})).rejects.toMatchObject({ status: 400 });
    expect(f.acceso.ejecutar).not.toHaveBeenCalled();
  });
  it.each([null, [], { negocioId: '1' }, { pagina: '0' }, { limite: '101' }, { pagina: ['1'] }, { pagina: '1000001' }])
    ('rechaza query %j', async (query) => {
      expect(() => validarPaginacionHistorial(query)).toThrow();
      expect(() => validarDetalleCita(query)).toThrow();
      const f = sinAcceso();
      await expect(f.agenda.detalle({ sub: 1, sesionId: 'sesion' }, '1', query)).rejects.toMatchObject({ status: 400 });
      await expect(f.agenda.historial({ sub: 1, sesionId: 'sesion' }, '1', query)).rejects.toMatchObject({ status: 400 });
      expect(f.acceso.ejecutar).not.toHaveBeenCalled();
    });
});
