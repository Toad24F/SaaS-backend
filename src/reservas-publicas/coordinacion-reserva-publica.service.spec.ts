import { ServiceUnavailableException } from '@nestjs/common';
import type { DataSource, EntityManager } from 'typeorm';
import { CoordinacionReservaPublicaService } from './coordinacion-reserva-publica.service';

describe('M3-T046: transacciones públicas acotadas', () => {
  it('repite toda la transacción con la misma clave y entrega solo el commit', async () => {
    let intento = 0;
    const transaction = jest.fn(async (_nivel: string,
      ejecutar: (manager: EntityManager) => Promise<string>) => {
      intento += 1;
      return ejecutar({ intento } as unknown as EntityManager);
    });
    const servicio = new CoordinacionReservaPublicaService(
      { transaction } as unknown as DataSource, { ahora: () => new Date(0) });
    const claves: string[] = [];
    const resultado = await servicio.transaccion('misma-clave', async (manager) => {
      claves.push('misma-clave');
      if ((manager as unknown as { intento: number }).intento === 1) {
        throw { code: 'ER_LOCK_DEADLOCK' };
      }
      return 'confirmado';
    });
    expect(resultado).toBe('confirmado');
    expect(claves).toEqual(['misma-clave', 'misma-clave']);
    expect(transaction).toHaveBeenCalledTimes(2);
    expect(transaction.mock.calls[0][0]).toBe('READ COMMITTED');
  });

  it('agota tres intentos técnicos como 503 y no repite errores funcionales', async () => {
    const transaction = jest.fn().mockRejectedValue({ code: 'ER_LOCK_WAIT_TIMEOUT' });
    const servicio = new CoordinacionReservaPublicaService(
      { transaction } as unknown as DataSource, { ahora: () => new Date(0) });
    await expect(servicio.transaccion('clave-estable', async () => 'no ocurre'))
      .rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(transaction).toHaveBeenCalledTimes(3);
    transaction.mockReset().mockRejectedValueOnce(new Error('validación funcional'));
    await expect(servicio.transaccion('clave-estable', async () => 'no ocurre'))
      .rejects.toThrow('validación funcional');
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});
