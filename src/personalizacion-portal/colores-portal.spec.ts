import {
  COLORES_PREDETERMINADOS_PORTAL,
  cumpleContraste,
  validarColoresPortal,
} from './colores-portal';

describe('Colores del portal', () => {
  it('valida la paleta predeterminada y normaliza hexadecimales opacos', () => {
    expect(validarColoresPortal({ ...COLORES_PREDETERMINADOS_PORTAL, fondo: '#FFFFFF' }))
      .toEqual(COLORES_PREDETERMINADOS_PORTAL);
  });

  it.each(['#fff', '#ffffff80', 'transparent', 'red', '#ffffff\n'])('rechaza %s como color', (texto) => {
    expect(() => validarColoresPortal({ ...COLORES_PREDETERMINADOS_PORTAL, texto })).toThrow('texto');
  });

  it.each([
    [4.5, '#767676', '#777777'],
    [3, '#949494', '#959595'],
  ] as const)('comprueba el umbral %s sin redondear', (minimo, cumple, falla) => {
    expect(cumpleContraste(cumple, '#ffffff', minimo)).toBe(true);
    expect(cumpleContraste(falla, '#ffffff', minimo)).toBe(false);
  });

  it('identifica las parejas deficientes de texto, enlace y botón', () => {
    const validar = () => validarColoresPortal({ fondo: '#ffffff', texto: '#777777', acento: '#777777' });
    expect(validar).toThrow(/texto normal.*enlace.*texto de botón/);
  });

  it('valida el foco interior a 3:1 aunque el enlace y la etiqueta del botón sean legibles', () => {
    expect(validarColoresPortal({ fondo: '#ffffff', texto: '#000000', acento: '#5a5a5a' }))
      .toMatchObject({ acento: '#5a5a5a' });
    expect(() => validarColoresPortal({ fondo: '#ffffff', texto: '#000000', acento: '#585858' }))
      .toThrow('foco interior del botón');
  });

  it('indica cuando el borde de control y el foco exterior quedan por debajo de 3:1', () => {
    expect(() => validarColoresPortal({ fondo: '#ffffff', texto: '#000000', acento: '#959595' }))
      .toThrow(/borde del control.*foco exterior/);
  });

  it('devuelve solo los colores de marca y conserva los estados fuera de la paleta', () => {
    const entrada = { ...COLORES_PREDETERMINADOS_PORTAL, cancelada: '#ffffff' };
    expect(validarColoresPortal(entrada)).toEqual(COLORES_PREDETERMINADOS_PORTAL);
  });
});
