import { createTransport } from 'nodemailer';
import type { SendMailOptions } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import type { MensajeCorreo, ResultadoEntregaCorreo, TransporteCorreo } from './transporte-correo';

interface DriverSmtp {
  sendMail(datos: SendMailOptions): Promise<{ messageId: string; accepted: unknown[] }>;
}
type FabricaSmtp = (opciones: SMTPTransport.Options) => DriverSmtp;
const CORREO_SIMPLE = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;

/** Adaptador SMTP: configuración externa, mensaje transitorio y errores sin secretos. */
export class TransporteCorreoSmtp implements TransporteCorreo {
  constructor(
    private readonly env: Record<string, string | undefined> = process.env,
    private readonly fabrica: FabricaSmtp = (opciones) => createTransport(opciones),
  ) {}

  async enviar(mensaje: MensajeCorreo): Promise<ResultadoEntregaCorreo> {
    // Validamos antes de construir el driver; crear el módulo no abre conexiones.
    const requerida = (nombre: string): string => {
      const valor = this.env[nombre];
      if (!valor?.trim()) throw new Error(`Configuración de correo incompleta: ${nombre}.`);
      return valor;
    };
    const remitente = requerida('CORREO_REMITENTE').trim().toLowerCase();
    const host = requerida('SMTP_HOST').trim();
    const user = requerida('SMTP_USER').trim();
    const pass = requerida('SMTP_PASS');
    const port = Number(this.env.SMTP_PORT ?? '587');
    const timeout = Number(this.env.SMTP_TIMEOUT_MS ?? '10000');
    const secure = this.env.SMTP_SECURE ?? 'false';
    if (!CORREO_SIMPLE.test(remitente) || /\s/.test(host) ||
      !Number.isInteger(port) || port < 1 || port > 65535 ||
      !Number.isInteger(timeout) || timeout < 1 || timeout > 120000 ||
      !['true', 'false'].includes(secure)) {
      throw new Error('Configuración de correo inválida.');
    }
    const destinatario = mensaje.destinatario.trim().toLowerCase();
    if (!CORREO_SIMPLE.test(destinatario) || /[\r\n]/.test(mensaje.asunto)) {
      throw new Error('Destinatario o asunto de correo inválido.');
    }
    try {
      // TLS implícito o STARTTLS obligatorio; nunca habilitamos logs del protocolo.
      const driver = this.fabrica({
        host, port, secure: secure === 'true', requireTLS: secure === 'false',
        auth: { user, pass }, logger: false, debug: false,
        connectionTimeout: timeout, greetingTimeout: timeout, socketTimeout: timeout,
      });
      const resultado = await driver.sendMail({
        from: remitente, to: destinatario, subject: mensaje.asunto, text: mensaje.texto,
        disableFileAccess: true, disableUrlAccess: true,
      });
      if (!resultado.messageId || !resultado.accepted.includes(destinatario)) {
        throw new Error('Entrega no confirmada.');
      }
      return { idExterno: resultado.messageId };
    } catch (error) {
      // Los errores SMTP pueden contener credenciales, destinatarios o códigos: no los propagamos.
      if (typeof error === 'object' && error !== null &&
        'code' in error && error.code === 'ETIMEDOUT') {
        const timeoutError = new Error('Tiempo de espera agotado al entregar el correo.');
        timeoutError.name = 'TimeoutError';
        throw timeoutError;
      }
      throw new Error('No se pudo entregar el correo.');
    }
  }
}
