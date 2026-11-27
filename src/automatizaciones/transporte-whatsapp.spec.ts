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

  it('arma los cuerpos con nombres históricos, plazo para Pendiente y ubicación para Confirmada y recordatorio', () => {
    const cita = Object.assign(new Cita(), {
      nombreNegocio: 'Negocio histórico', nombreServicio: 'Servicio histórico',
      nombreSucursal: 'Sucursal histórica', nombreProfesional: 'Profesional histórico',
      inicioUtc: new Date('2026-11-23T19:30:00Z'), zonaHorariaReserva: 'America/Chihuahua',
      folio: 'FOLIO-PRIVADO', motivoConsulta: 'nota sensible', nombreContacto: 'Contacto',
    });
    const vencimiento = new Date('2026-11-23T18:00:00Z');
    const direccion = 'Av. Colón 123, Chihuahua';
    const urlGoogleMaps = 'https://maps.app.goo.gl/sucursal-centro';
    const pendiente = construirPlantillaWhatsapp(cita, {
      tipo: 'inicial_pendiente', vencimientoUtc: vencimiento, respuestaRapida: 'acción',
    });
    const confirmada = construirPlantillaWhatsapp(cita, {
      tipo: 'inicial_confirmada', ubicacion: { direccion, urlGoogleMaps },
    });
    const recordatorio = construirPlantillaWhatsapp(cita, {
      tipo: 'recordatorio', ubicacion: { direccion, urlGoogleMaps: null },
    });
    expect(pendiente).toMatchObject({ respuestaRapida: 'acción' });
    expect(pendiente.cuerpo[5]).toMatch(/12:00.*America\/Chihuahua.*cancelación/i);
    expect(construirPlantillaWhatsapp(cita, {
      tipo: 'inicial_pendiente', vencimientoUtc: null, respuestaRapida: 'acción',
    }).cuerpo[5])
      .toMatch(/seguimiento manual.*sin cancelación/i);
    expect(confirmada.cuerpo[5]).toBe(urlGoogleMaps);
    expect(recordatorio.cuerpo[5]).toBe('https://www.google.com/maps/search/?api=1&query=Av.+Col%C3%B3n+123%2C+Chihuahua');
    expect(confirmada).not.toHaveProperty('respuestaRapida');
    expect(recordatorio).not.toHaveProperty('respuestaRapida');
    for (const plantilla of [pendiente, confirmada, recordatorio]) {
      expect(plantilla.cuerpo).toHaveLength(6);
      expect(plantilla.cuerpo.slice(0, 4)).toEqual([
        'Negocio histórico', 'Servicio histórico', 'Sucursal histórica', 'Profesional histórico',
      ]);
      expect(plantilla.cuerpo[4]).toMatch(/13:30.*America\/Chihuahua/);
      expect(JSON.stringify(plantilla)).not.toMatch(/FOLIO-PRIVADO|nota sensible|Contacto/);
    }
  });

  const configuracion = { versionGraph: 'v26.0', idioma: 'es_MX', plantillas: {
    inicial_pendiente: 'cita_pendiente', inicial_confirmada: 'cita_confirmada', recordatorio: 'cita_recordatorio',
  } };

  it('usa remitente y versión explícitos y resuelve Bearer fuera del cuerpo', async () => {
    const secreto = jest.fn(async () => 'token-sintetico');
    const http = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
      async () => Response.json({ messages: [{ id: 'wamid.prueba' }] }));
    const meta = new MetaWhatsapp(configuracion, secreto, http);
    const correlacion = '9cf44878-45e5-468f-9289-b29508853d9a';
    expect(await meta.enviar({ ...solicitud, correlacion })).toEqual({ estado: 'aceptado', referencia: 'wamid.prueba' });
    expect(secreto).toHaveBeenCalledWith(canal.secretoRef);
    const [url, opciones] = http.mock.calls[0];
    expect(url).toBe('https://graph.facebook.com/v26.0/123456/messages');
    expect(new Headers(opciones?.headers).get('authorization')).toBe('Bearer token-sintetico');
    expect(JSON.parse(String(opciones?.body))).toEqual({ messaging_product: 'whatsapp', biz_opaque_callback_data: correlacion,
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
