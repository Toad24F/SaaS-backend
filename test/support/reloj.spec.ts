import { RelojPrueba } from './reloj';

describe('Reloj reutilizable de pruebas (T06)', () => {
  it('permite fijar y avanzar el tiempo sin esperas reales', () => {
    const reloj = new RelojPrueba(new Date('2028-02-29T12:00:00Z'));
    expect(reloj.ahora().toISOString()).toBe('2028-02-29T12:00:00.000Z');
    reloj.avanzar(30 * 60 * 1000);
    expect(reloj.ahora().toISOString()).toBe('2028-02-29T12:30:00.000Z');
    reloj.fijar(new Date('2028-03-31T12:00:00Z'));
    expect(reloj.ahora().toISOString()).toBe('2028-03-31T12:00:00.000Z');
  });

  it('permite comprobar el instante anterior y exacto de un vencimiento', () => {
    const reloj = new RelojPrueba(new Date('2026-09-10T00:00:00Z'));
    const vencimiento = reloj.ahora().getTime() + 60 * 60 * 1000;
    reloj.avanzar(60 * 60 * 1000 - 1);
    expect(reloj.ahora().getTime()).toBe(vencimiento - 1);
    reloj.avanzar(1);
    expect(reloj.ahora().getTime()).toBe(vencimiento);
  });

  it('no comparte fechas mutables ni estado entre relojes', () => {
    const fecha = new Date('2026-09-10T00:00:00Z');
    const primero = new RelojPrueba(fecha);
    const segundo = new RelojPrueba(fecha);
    fecha.setUTCFullYear(2030);
    primero.ahora().setUTCFullYear(2031);
    primero.avanzar(1);
    expect(segundo.ahora().toISOString()).toBe('2026-09-10T00:00:00.000Z');
    expect(primero.ahora().getTime() - segundo.ahora().getTime()).toBe(1);
  });

  it('rechaza fechas inválidas sin cambiar el instante previo', () => {
    expect(() => new RelojPrueba(new Date(NaN))).toThrow();
    const reloj = new RelojPrueba(new Date(0));
    expect(() => reloj.fijar(new Date(NaN))).toThrow();
    expect(reloj.ahora().getTime()).toBe(0);
  });

  it.each([-1, NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER])(
    'rechaza avances inválidos: %s', (avance) => {
      const reloj = new RelojPrueba(new Date(0));
      expect(() => reloj.avanzar(avance)).toThrow();
      expect(reloj.ahora().getTime()).toBe(0);
    },
  );
});
