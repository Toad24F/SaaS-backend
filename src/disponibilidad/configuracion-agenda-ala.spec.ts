import { CONFIGURACION_INICIAL, validarConfiguracionAgenda } from './configuracion-agenda.validador';

describe('ALA-T087: tiempo entre citas', () => {
  const base = { modo: 'ventana_libre', tiempoEntreCitasMinutos: 0,
    anticipacionMinutos: 15, diasFuturos: 60 };

  it('inicia en Libre, sin separación y con anticipación y horizonte vigentes', () => {
    expect(CONFIGURACION_INICIAL).toEqual(base);
    for (const tiempoEntreCitasMinutos of [0, 5, 60]) {
      expect(validarConfiguracionAgenda({ ...base, tiempoEntreCitasMinutos }))
        .toEqual({ ...base, tiempoEntreCitasMinutos });
    }
  });

  it('rechaza el intervalo retirado y separaciones fuera de la serie permitida', () => {
    for (const valor of [1, 4, 6, 65, -5, 2.5, '5', null]) {
      expect(() => validarConfiguracionAgenda({ ...base,
        tiempoEntreCitasMinutos: valor })).toThrow();
    }
    expect(() => validarConfiguracionAgenda({ ...base, intervaloMinutos: 15 })).toThrow();
    expect(() => validarConfiguracionAgenda({ ...base,
      tiempoEntreCitasMinutos: undefined })).toThrow();
  });
});
