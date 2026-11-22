import { clasificarBloqueo } from './clasificacion-bloqueo';

const dia = { fechaInicio: '2026-10-10', fechaFin: '2026-10-10',
  inicioMinutos: null, finMinutos: null };

describe('M5-T039: vigencia de bloqueos por intervalo exclusivo', () => {
  it('pasa a anterior exactamente en el fin de un día completo', () => {
    const zona = ['America/Chihuahua'];
    expect(clasificarBloqueo(dia, zona, new Date('2026-10-11T05:59:59.999Z'))).toBe('vigente');
    expect(clasificarBloqueo(dia, zona, new Date('2026-10-11T06:00:00.000Z'))).toBe('anterior');
  });

  it('cuenta una fila colectiva una vez si sigue vigente en cualquiera de sus zonas', () => {
    expect(clasificarBloqueo(dia, ['America/Chihuahua', 'America/Tijuana'],
      new Date('2026-10-11T06:30:00.000Z'))).toBe('vigente');
  });

  it('distingue un intervalo futuro y excluye el extremo final del rango', () => {
    expect(clasificarBloqueo({ ...dia, fechaInicio: '2026-10-12', fechaFin: '2026-10-12' },
      ['America/Chihuahua'], new Date('2026-10-11T12:00:00.000Z'))).toBe('proximo');
  });
});
