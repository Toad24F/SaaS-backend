import { validarPublicacionPortal } from './personalizacion-portal.entradas';

describe('Publicación de marca del portal', () => {
  const entrada = { version: 0, logoId: null, acento: '#FFFFFF' };

  it('normaliza el acento opaco y conserva el control de versión y el logo', () => {
    expect(validarPublicacionPortal(entrada)).toEqual({ ...entrada, acento: '#ffffff' });
  });

  it.each(['#fff', '#ffffff80', 'transparent', 'red', '#ffffff\n', null])('rechaza %s como acento', (acento) => {
    expect(() => validarPublicacionPortal({ ...entrada, acento })).toThrow('acento');
  });

  it.each([{ fondo: '#ffffff' }, { texto: '#000000' }, { colores: { acento: '#ffffff' } }])
    ('rechaza los campos fuera del contrato %j', (campo) => {
      expect(() => validarPublicacionPortal({ ...entrada, ...campo })).toThrow('campos esperados');
    });
});
