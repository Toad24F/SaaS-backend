import { Logger } from '@nestjs/common';
import { MetricasPortalService } from './metricas-portal.service';

describe('M3-T127: métricas agregadas del portal', () => {
  it('distingue eventos y registra solo categorías y cantidades', () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    try {
      const metricas = new MetricasPortalService();
      for (const evento of ['conflicto', 'expiracion', 'fallo', 'recuperacion'] as const) {
        metricas.contar(evento);
      }
      metricas.contar('conflicto');
      expect(metricas.consultar()).toEqual({ conflicto: 2, expiracion: 1,
        fallo: 1, recuperacion: 1 });
      expect(log).toHaveBeenCalledTimes(5);
      for (const llamada of log.mock.calls) {
        expect(String(llamada[0])).toMatch(/^portal_publico (conflicto|expiracion|fallo|recuperacion) total=\d+$/);
        expect(JSON.stringify(llamada)).not.toMatch(/nombre|telefono|notas|cookie|csrf|clave|titular/i);
      }
    } finally { log.mockRestore(); }
  });
});
