import { validarConfiguracionAgenda } from './configuracion-agenda.validador';

describe('M2-T020/T024: conjunto completo de agenda', () => {
  const base = { modo: 'ventana_libre', intervaloMinutos: 15,
    anticipacionMinutos: 15, diasFuturos: 60 };

  it('admite los seis pasos, anticipación 0/5/15 y horizonte 0/60', () => {
    for (const intervaloMinutos of [5, 10, 15, 20, 30, 60]) {
      expect(validarConfiguracionAgenda({ ...base, intervaloMinutos }))
        .toMatchObject({ intervaloMinutos });
    }
    for (const anticipacionMinutos of [0, 5, 15]) {
      expect(validarConfiguracionAgenda({ ...base, anticipacionMinutos }))
        .toMatchObject({ anticipacionMinutos });
    }
    for (const diasFuturos of [0, 60]) {
      expect(validarConfiguracionAgenda({ ...base, diasFuturos }))
        .toMatchObject({ diasFuturos });
    }
    expect(validarConfiguracionAgenda({ ...base, modo: 'agenda_compacta' }))
      .toMatchObject({ modo: 'agenda_compacta' });
  });

  it('rechaza campos ausentes, extraños, inválidos y no representables', () => {
    for (const valor of [null, {}, { ...base, diasFuturos: undefined },
      { ...base, negocioId: 1 }, { ...base, modo: 'desconocido' },
      ...[7, -5, 2.5, 4_294_967_295, Number.MAX_SAFE_INTEGER + 1, Infinity, '5']
        .map((anticipacionMinutos) => ({ ...base, anticipacionMinutos })),
      ...[-1, 0.5, Number.MAX_SAFE_INTEGER + 1, '60']
        .map((diasFuturos) => ({ ...base, diasFuturos })),
      { ...base, intervaloMinutos: 7 }]) {
      expect(() => validarConfiguracionAgenda(valor)).toThrow();
    }
  });
});
