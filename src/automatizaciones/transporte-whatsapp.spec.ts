import { Cita } from '../disponibilidad/entities/cita.entity';
import { construirPlantillaWhatsapp } from './plantillas-whatsapp';
import { MetaWhatsapp, TransporteWhatsappControlado } from './transporte-whatsapp';

const canal = { remitenteExternoId: '123456', secretoRef: 'secret://whatsapp/test' };
const solicitud = {
  canal, destinoE164: '+526141234567', tipo: 'inicial_pendiente' as const,
  plantilla: { cuerpo: ['Turno histórico'], respuestaRapida: 'opaca-de-prueba' },
};

describe('M5-T074–T076, transporte y plantillas de WhatsApp', () => {
  it('permite ensayar aceptación, rechazo e incertidumbre sin red', async () => {
    const resultados = [
      { estado: 'aceptado', referencia: 'wamid.prueba' },
      { estado: 'rechazado', transitorio: false },
      { estado: 'incierto' },
    ] as const;
    const transporte = new TransporteWhatsappControlado(...resultados);
    for (const resultado of resultados) expect(await transporte.enviar(solicitud)).toEqual(resultado);
    expect(transporte.solicitudes).toEqual(Array(3).fill(solicitud));
  });

  it('arma los tres cuerpos con nombres históricos, zona y plazo solo para Pendiente', () => {
    const cita = Object.assign(new Cita(), {
      nombreNegocio: 'Negocio histórico', nombreServicio: 'Servicio histórico',
      nombreSucursal: 'Sucursal histórica', nombreProfesional: 'Profesional histórico',
      inicioUtc: new Date('2026-11-23T19:30:00Z'), zonaHorariaReserva: 'America/Chihuahua',
      folio: 'FOLIO-PRIVADO', motivoConsulta: 'nota sensible', nombreContacto: 'Contacto',
    });
    const vencimiento = new Date('2026-11-23T18:00:00Z');
    const pendiente = construirPlantillaWhatsapp('inicial_pendiente', cita, vencimiento, 'acción');
    const confirmada = construirPlantillaWhatsapp('inicial_confirmada', cita, null);
    const recordatorio = construirPlantillaWhatsapp('recordatorio', cita, null);
    expect(pendiente).toMatchObject({ respuestaRapida: 'acción' });
    expect(pendiente.cuerpo.join(' ')).toMatch(/12:00.*America\/Chihuahua.*cancelación/i);
    expect(construirPlantillaWhatsapp('inicial_pendiente', cita, null, 'acción').cuerpo.join(' '))
      .toMatch(/seguimiento manual.*sin cancelación/i);
    expect(confirmada).not.toHaveProperty('respuestaRapida');
    expect(recordatorio).not.toHaveProperty('respuestaRapida');
    for (const plantilla of [pendiente, confirmada, recordatorio]) {
      expect(plantilla.cuerpo).toEqual(expect.arrayContaining([
        'Negocio histórico', 'Servicio histórico', 'Sucursal histórica', 'Profesional histórico',
      ]));
      expect(plantilla.cuerpo.join(' ')).toMatch(/13:30.*America\/Chihuahua/);
      expect(JSON.stringify(plantilla)).not.toMatch(/FOLIO-PRIVADO|nota sensible|Contacto/);
    }
  });

  const configuracion = { versionGraph: 'v26.0', idioma: 'es_MX', plantillas: {
    inicial_pendiente: 'cita_pendiente', inicial_confirmada: 'cita_confirmada', recordatorio: 'recordatorio',
  } };

  it('usa remitente y versión explícitos y resuelve Bearer fuera del cuerpo', async () => {
    const secreto = jest.fn(async () => 'token-sintetico');
    const http = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
      async () => Response.json({ messages: [{ id: 'wamid.prueba' }] }));
    const meta = new MetaWhatsapp(configuracion, secreto, http);
    expect(await meta.enviar(solicitud)).toEqual({ estado: 'aceptado', referencia: 'wamid.prueba' });
    expect(secreto).toHaveBeenCalledWith(canal.secretoRef);
    const [url, opciones] = http.mock.calls[0];
    expect(url).toBe('https://graph.facebook.com/v26.0/123456/messages');
    expect(new Headers(opciones?.headers).get('authorization')).toBe('Bearer token-sintetico');
    expect(JSON.parse(String(opciones?.body))).toEqual({ messaging_product: 'whatsapp',
      to: '526141234567', type: 'template', template: { name: 'cita_pendiente', language: { code: 'es_MX' },
        components: [{ type: 'body', parameters: [{ type: 'text', text: 'Turno histórico' }] },
          { type: 'button', sub_type: 'quick_reply', index: '0',
            parameters: [{ type: 'payload', payload: 'opaca-de-prueba' }] }],
      } });
    expect(opciones?.body).not.toMatch(/token-sintetico|secret:\/\//);
  });

  it.each([
    [400, { estado: 'rechazado', transitorio: false }],
    [429, { estado: 'rechazado', transitorio: true, reintentarEnMs: 120_000 }],
    [502, { estado: 'incierto' }],
    [200, { estado: 'incierto' }],
  ] as const)('clasifica una respuesta Graph %s sin propagar datos del proveedor', async (status, resultado) => {
    const http = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
      async () => Response.json({ error: { message: 'valor privado' } },
        { status, headers: { 'Retry-After': '120' } }));
    expect(await new MetaWhatsapp(configuracion, async () => 'token', http).enviar(solicitud)).toEqual(resultado);
  });

  it('distingue error de red después de invocar HTTP de credencial faltante', async () => {
    const http = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
      async () => { throw new Error('fallo de red'); });
    expect(await new MetaWhatsapp(configuracion, async () => undefined, http).enviar(solicitud))
      .toEqual({ estado: 'rechazado', transitorio: false });
    expect(http).not.toHaveBeenCalled();
    expect(await new MetaWhatsapp(configuracion, async () => 'token', http).enviar(solicitud))
      .toEqual({ estado: 'incierto' });
  });
});
