import { TransporteCorreoSmtp } from './transporte-correo-smtp';

describe('M1-T028: adaptador SMTP configurado y controlado', () => {
  const env = {
    CORREO_REMITENTE: 'sistema@example.test', SMTP_HOST: 'smtp.example.test',
    SMTP_PORT: '587', SMTP_SECURE: 'false', SMTP_USER: 'usuario-prueba',
    SMTP_PASS: 'secreto-solo-en-memoria', SMTP_TIMEOUT_MS: '1500',
  };
  const mensaje = { destinatario: 'admin@example.test', asunto: 'Activación', texto: 'codigo-transitorio' };

  it('obtiene configuración y entrega un único mensaje sin logs ni persistencia', async () => {
    // El driver inyectado captura en memoria y no contacta destinatarios reales.
    const sendMail = jest.fn().mockResolvedValue({ messageId: 'smtp-1', accepted: [mensaje.destinatario] });
    const fabrica = jest.fn().mockReturnValue({ sendMail });
    const transporte = new TransporteCorreoSmtp(env, fabrica);
    expect(fabrica).not.toHaveBeenCalled();
    await expect(transporte.enviar(mensaje)).resolves.toEqual({ idExterno: 'smtp-1' });
    expect(fabrica).toHaveBeenCalledWith(expect.objectContaining({
      host: env.SMTP_HOST, port: 587, secure: false, requireTLS: true,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
      logger: false, debug: false, connectionTimeout: 1500,
    }));
    expect(sendMail).toHaveBeenCalledWith({ from: env.CORREO_REMITENTE,
      to: mensaje.destinatario, subject: mensaje.asunto, text: mensaje.texto,
      disableFileAccess: true, disableUrlAccess: true });
  });

  it.each(['CORREO_REMITENTE', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'])(
    'rechaza configuración faltante %s antes de crear el driver', async (campo) => {
      const fabrica = jest.fn();
      await expect(new TransporteCorreoSmtp({ ...env, [campo]: '' }, fabrica)
        .enviar(mensaje)).rejects.toThrow(campo);
      expect(fabrica).not.toHaveBeenCalled();
    },
  );

  it.each([{ SMTP_PORT: '0' }, { SMTP_PORT: 'x' }, { SMTP_SECURE: 'sí' }, { SMTP_TIMEOUT_MS: '-1' }])(
    'rechaza valores inválidos sin exponer credenciales', async (cambio) => {
      await expect(new TransporteCorreoSmtp({ ...env, ...cambio }, jest.fn())
        .enviar(mensaje)).rejects.toThrow('Configuración');
    },
  );

  it('oculta detalles del proveedor y conserva la señal de timeout', async () => {
    const sendMail = jest.fn().mockRejectedValue(Object.assign(
      new Error(`${env.SMTP_PASS} ${mensaje.texto}`), { code: 'ETIMEDOUT' }));
    const transporte = new TransporteCorreoSmtp(env, () => ({ sendMail }));
    await expect(transporte.enviar(mensaje)).rejects.toMatchObject({
      name: 'TimeoutError', message: 'Tiempo de espera agotado al entregar el correo.',
    });
    sendMail.mockRejectedValueOnce(new Error(`${env.SMTP_PASS} ${mensaje.texto}`));
    await expect(transporte.enviar(mensaje)).rejects.toThrow('No se pudo entregar el correo.');
  });

  it('rechaza una entrega que no confirma al destinatario', async () => {
    const transporte = new TransporteCorreoSmtp(env, () => ({
      sendMail: jest.fn().mockResolvedValue({ messageId: 'smtp-2', accepted: [] }),
    }));
    await expect(transporte.enviar(mensaje)).rejects.toThrow('No se pudo entregar');
  });
});
