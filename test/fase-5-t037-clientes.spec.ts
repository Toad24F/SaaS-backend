import { validarAltaCliente, validarCorreccionCliente, validarBusquedaClientes, validarIdCliente } from '../src/clientes/clientes.entrada';
import { ClientesService } from '../src/clientes/clientes.service';
import type { AccesoOperativoService } from '../src/citas/acceso-operativo.service';
import { AuditoriaService } from '../src/auditoria/auditoria.service';

const valido = { nombreCompleto: '  Ana Pérez  ', telefono: '+52 614-123-4567' };
const identidad = { sub: 1, sesionId: 'sesion' };
function sinDatos() {
  const acceso = { ejecutar: jest.fn() };
  return { acceso, servicio: new ClientesService(acceso as unknown as AccesoOperativoService, new AuditoriaService()) };
}

describe('M4-T037: entradas cerradas y contacto normalizado', () => {
  it('normaliza contacto y respeta 150 caracteres Unicode, sin truncar', () => {
    expect(validarAltaCliente(valido)).toEqual({ nombreCompleto: 'Ana Pérez', telefono: '6141234567' });
    expect(validarAltaCliente({ nombreCompleto: '𠮷'.repeat(150), telefono: '614 123 4567' }).nombreCompleto).toHaveLength(300);
  });
  it.each([null, [], {}, { ...valido, nombreCompleto: '' }, { ...valido, nombreCompleto: '  ' },
    { ...valido, nombreCompleto: 'a'.repeat(151) }, { ...valido, nombreCompleto: 1 },
    { ...valido, telefono: 6141234567 }, { ...valido, telefono: '614123456' },
    { ...valido, telefono: '+1 6141234567' }, { ...valido, telefono: '614abc4567' },
    { ...valido, negocioId: 2 }, { ...valido, notas: 'Privadas' }, { ...valido, email: 'x@example.test' },
    { ...valido, version: 1 }, { nombreCompleto: 'Ana' }, { telefono: '6141234567' }])
    ('rechaza alta inválida antes de consultar datos: %j', async (entrada) => {
      const f = sinDatos();
      expect(() => validarAltaCliente(entrada)).toThrow();
      await expect(f.servicio.crear(identidad, entrada)).rejects.toMatchObject({ status: 400 });
      expect(f.acceso.ejecutar).not.toHaveBeenCalled();
    });
  it('admite corrección parcial con versión numérica observada', () => {
    expect(validarCorreccionCliente({ version: 1, nombreCompleto: ' Ana ' })).toEqual({ version: 1, nombreCompleto: 'Ana' });
    expect(validarCorreccionCliente({ version: 2, telefono: '+52 614-123-4567' })).toEqual({ version: 2, telefono: '6141234567' });
  });
  it.each([null, [], {}, { version: 1 }, { ...valido, version: '1' }, { ...valido, version: 0 },
    { ...valido, version: 4294967296 }, { ...valido, version: 1, negocioId: 2 },
    { version: 1, telefono: '' }, { version: 1, nombreCompleto: null }])
    ('rechaza corrección inválida antes de consultar datos: %j', async (entrada) => {
      const f = sinDatos();
      expect(() => validarCorreccionCliente(entrada)).toThrow();
      await expect(f.servicio.corregir(identidad, '1', entrada)).rejects.toMatchObject({ status: 400 });
      expect(f.acceso.ejecutar).not.toHaveBeenCalled();
    });
  it('acota búsquedas privadas y conserva nombre/teléfono como texto de búsqueda', () => {
    expect(validarBusquedaClientes({})).toEqual({ pagina: 1, limite: 50 });
    expect(validarBusquedaClientes({ busqueda: ' +52 614-123 ', pagina: '2', limite: '100' }))
      .toEqual({ busqueda: '+52 614-123', pagina: 2, limite: 100 });
  });
  it.each([{ pagina: '0' }, { limite: '101' }, { negocioId: '2' }, { busqueda: ['Ana'] }, { busqueda: 'a'.repeat(151) }])
    ('rechaza query inválida: %j', (entrada) => expect(() => validarBusquedaClientes(entrada)).toThrow());
  it.each(['0', '1 OR 1=1'])('rechaza ID %s', (id) => expect(() => validarIdCliente(id)).toThrow());
});
