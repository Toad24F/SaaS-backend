import { conCarreraTemporal } from './support/carreras-modulo-1';
import { QueryRunner } from 'typeorm';

describe('M1-T007: dos conexiones coordinadas sobre base temporal', () => {
  it('libera ambos trabajos solo cuando llegaron a la barrera', async () => {
    const entradas: number[] = [];
    const resultado = await conCarreraTemporal(async (runner, barrera, indice) => {
      const filas = await runner.query('SELECT CONNECTION_ID() AS id');
      entradas.push(indice);
      await barrera.esperar();
      expect(entradas).toHaveLength(2);
      return Number(filas[0].id);
    });
    expect(resultado[0]).not.toBe(resultado[1]);
  });

  it('cierra los corredores aunque un trabajo falle antes de la barrera', async () => {
    const corredores: QueryRunner[] = [];
    await expect(conCarreraTemporal(async (runner, barrera, indice) => {
      corredores.push(runner);
      if (indice === 0) throw new Error('fallo controlado');
      await barrera.esperar();
      return indice;
    })).rejects.toThrow('fallo controlado');
    // El rechazo despierta al otro participante y ambos corredores se liberan.
    expect(corredores).toHaveLength(2);
    expect(corredores.every((runner) => runner.isReleased)).toBe(true);
  });
});
