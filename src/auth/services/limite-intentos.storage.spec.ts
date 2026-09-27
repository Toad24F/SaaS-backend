import type { Repository } from 'typeorm';
import type { Reloj } from '../../comun/reloj';
import { LimiteIntentos } from '../entities/limite-intentos.entity';
import { LimiteIntentosStorage } from './limite-intentos.storage';

describe('Regresión T73: reintento de concurrencia en la cuota por IP', () => {
  it('reintenta un deadlock transitorio sin perder el intento', async () => {
    const resultado = { totalHits: 1, timeToExpire: 1000, isBlocked: false, timeToBlockExpire: 0 };
    const transaction = jest.fn()
      .mockRejectedValueOnce({ driverError: { code: 'ER_LOCK_DEADLOCK' } })
      .mockResolvedValueOnce(resultado);
    const repositorio = { manager: { transaction } } as unknown as Repository<LimiteIntentos>;
    const reloj = { ahora: () => new Date() } as Reloj;
    // El primer intento simula el perdedor de un deadlock de inserción simultánea.
    await expect(new LimiteIntentosStorage(repositorio, reloj)
      .increment('203.0.113.10', 1000, 5, 60_000, 'global')).resolves.toEqual(resultado);
    expect(transaction).toHaveBeenCalledTimes(2);
  });
});
