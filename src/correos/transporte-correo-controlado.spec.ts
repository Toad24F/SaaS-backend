import { TransporteCorreoControlado } from './transporte-correo-controlado';
import type { TransporteCorreo } from './transporte-correo';

describe('M1-T027: transporte controlado sin red', () => {
  const mensaje = {
    destinatario: 'admin@example.test',
    asunto: 'Activación',
    texto: 'Código de prueba que solo vive en memoria',
  };

  it('acepta y captura el mensaje en memoria a través del contrato', async () => {
    const transporte: TransporteCorreo = new TransporteCorreoControlado(['aceptar']);
    await expect(transporte.enviar(mensaje)).resolves.toEqual({ idExterno: 'controlado-1' });
    const controlado = transporte as TransporteCorreoControlado;
    expect(controlado.intentos).toEqual([{ ...mensaje }]);
  });

  it('simula rechazo y timeout sin esperar ni contactar destinatarios', async () => {
    const transporte = new TransporteCorreoControlado(['rechazar', 'timeout']);
    await expect(transporte.enviar(mensaje)).rejects.toThrow('Entrega rechazada');
    await expect(transporte.enviar(mensaje)).rejects.toMatchObject({ name: 'TimeoutError' });
    expect(transporte.intentos).toHaveLength(2);
    expect(transporte.intentos[0]).toEqual(mensaje);
  });
});
