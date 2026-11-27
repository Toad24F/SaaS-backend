import { CicloWhatsappService } from './ciclo-whatsapp.service';

function preparar() {
  const envios = { ejecutarUna: jest.fn(async () => true) };
  const cancelaciones = { ejecutarLote: jest.fn(async () => ({ canceladas: 0, seguimiento: 0 })) };
  const recepcion = { procesarLote: jest.fn(async () => undefined) };
  return { envios, cancelaciones, recepcion, ciclo: new CicloWhatsappService(envios, cancelaciones, recepcion,
    { envios: true, cancelaciones: true, secretoApp: 'secreto-sintetico' }) };
}

describe('M5-T096 · Ciclo de WhatsApp', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('arranca un ciclo, limita cada lote, repite a los 15 segundos y se detiene', async () => {
    const { ciclo, envios, cancelaciones, recepcion } = preparar();
    ciclo.onApplicationBootstrap();
    await ciclo.ciclo();
    expect(envios.ejecutarUna).toHaveBeenCalledTimes(50);
    expect(cancelaciones.ejecutarLote).toHaveBeenCalledWith(50);
    expect(recepcion.procesarLote).toHaveBeenCalledWith('secreto-sintetico', 50);
    await jest.advanceTimersByTimeAsync(14_999);
    expect(envios.ejecutarUna).toHaveBeenCalledTimes(50);
    await jest.advanceTimersByTimeAsync(1);
    expect(envios.ejecutarUna).toHaveBeenCalledTimes(100);
    await ciclo.onModuleDestroy();
    await jest.advanceTimersByTimeAsync(30_000);
    expect(envios.ejecutarUna).toHaveBeenCalledTimes(100);
  });

  it('una operación lenta impide solapar ciclos y el apagado espera el intento actual', async () => {
    const { ciclo, envios } = preparar();
    let liberar!: (valor: boolean) => void;
    envios.ejecutarUna.mockImplementationOnce(() => new Promise((resolver) => { liberar = resolver; }));
    ciclo.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(45_000);
    expect(envios.ejecutarUna).toHaveBeenCalledTimes(1);
    const parada = ciclo.onModuleDestroy();
    liberar(true);
    await parada;
    expect(envios.ejecutarUna).toHaveBeenCalledTimes(1);
  });

  it('permite reanudar acuses con envío y cancelación apagados', async () => {
    const { envios, cancelaciones, recepcion } = preparar();
    const ciclo = new CicloWhatsappService(envios, cancelaciones, recepcion, { envios: false, cancelaciones: false, secretoApp: 'prueba' });
    await ciclo.ciclo();
    expect(recepcion.procesarLote).toHaveBeenCalledTimes(1);
    expect(envios.ejecutarUna).not.toHaveBeenCalled();
    expect(cancelaciones.ejecutarLote).not.toHaveBeenCalled();
  });
});
