import type { CanalWhatsapp } from './entities/canal-whatsapp.entity';
import type { TipoEnvioWhatsapp } from './entities/envio-whatsapp.entity';
import type { PlantillaWhatsapp } from './plantillas-whatsapp';

export const TRANSPORTE_WHATSAPP = Symbol('TRANSPORTE_WHATSAPP');

export interface SolicitudWhatsapp {
  canal: Pick<CanalWhatsapp, 'remitenteExternoId' | 'secretoRef'>;
  destinoE164: string;
  tipo: TipoEnvioWhatsapp;
  plantilla: PlantillaWhatsapp;
}

export type ResultadoWhatsapp =
  | { estado: 'aceptado'; referencia: string }
  | { estado: 'rechazado'; transitorio: boolean; reintentarEnMs?: number }
  | { estado: 'incierto' };

export interface TransporteWhatsapp {
  enviar(solicitud: SolicitudWhatsapp): Promise<ResultadoWhatsapp>;
}

export interface ConfiguracionMetaWhatsapp {
  versionGraph: string;
  idioma: string;
  plantillas: Record<TipoEnvioWhatsapp, string>;
}

/** Doble que registra solicitudes y consume resultados sintéticos en orden. */
export class TransporteWhatsappControlado implements TransporteWhatsapp {
  readonly solicitudes: SolicitudWhatsapp[] = [];
  private readonly resultados: ResultadoWhatsapp[];

  constructor(...resultados: ResultadoWhatsapp[]) {
    this.resultados = resultados;
  }

  async enviar(solicitud: SolicitudWhatsapp): Promise<ResultadoWhatsapp> {
    this.solicitudes.push(solicitud);
    const resultado = this.resultados.shift();
    if (!resultado) throw new Error('Falta un resultado sintético de WhatsApp.');
    return resultado;
  }
}

/** El token se obtiene al enviar y queda limitado a la cabecera de Meta. */
export class MetaWhatsapp implements TransporteWhatsapp {
  constructor(private readonly configuracion: ConfiguracionMetaWhatsapp,
    private readonly resolverSecreto: (referencia: string) => Promise<string | undefined>,
    private readonly http: typeof fetch = fetch) {}

  async enviar(solicitud: SolicitudWhatsapp): Promise<ResultadoWhatsapp> {
    const { canal, destinoE164, tipo, plantilla } = solicitud;
    const { versionGraph, idioma, plantillas } = this.configuracion;
    const nombre = plantillas[tipo];
    if (!/^v[1-9]\d*\.\d+$/.test(versionGraph) || !/^\d+$/.test(canal.remitenteExternoId)
      || !/^[a-z]{2}(?:_[A-Z]{2})?$/.test(idioma) || !/^[a-z0-9_]+$/.test(nombre)
      || !/^\+[1-9]\d{6,14}$/.test(destinoE164) || (tipo === 'inicial_pendiente' && !plantilla.respuestaRapida)) {
      return { estado: 'rechazado', transitorio: false };
    }

    let token: string | undefined;
    try {
      token = await this.resolverSecreto(canal.secretoRef);
    } catch {
      return { estado: 'rechazado', transitorio: true };
    }
    if (!token || !/^[!-~]+$/.test(token)) return { estado: 'rechazado', transitorio: false };

    const componentes: object[] = [{ type: 'body', parameters: plantilla.cuerpo.map((text) => ({ type: 'text', text })) }];
    if (tipo === 'inicial_pendiente') componentes.push({ type: 'button', sub_type: 'quick_reply', index: '0',
      parameters: [{ type: 'payload', payload: plantilla.respuestaRapida }] });
    try {
      const respuesta = await this.http(`https://graph.facebook.com/${versionGraph}/${canal.remitenteExternoId}/messages`, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10_000),
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', to: destinoE164.slice(1), type: 'template',
          template: { name: nombre, language: { code: idioma }, components: componentes } }),
      });
      if (respuesta.status === 429) {
        const espera = segundosReintento(respuesta.headers.get('Retry-After'));
        return { estado: 'rechazado', transitorio: true, ...(espera === undefined ? {} : { reintentarEnMs: espera }) };
      }
      if (respuesta.status >= 400 && respuesta.status < 500 && respuesta.status !== 408) {
        return { estado: 'rechazado', transitorio: false };
      }
      // Una aceptación sin ID, un timeout o un fallo intermedio dejan abierta la posibilidad de envío.
      if (respuesta.ok) {
        const datos = await respuesta.json() as { messages?: { id?: unknown }[] };
        const id = datos?.messages?.[0]?.id;
        if (typeof id === 'string' && /^\S{1,128}$/.test(id)) return { estado: 'aceptado', referencia: id };
      }
    } catch {
      // El error puede incluir URL, datos del proveedor o configuración. Solo sale la clasificación.
    }
    return { estado: 'incierto' };
  }
}

function segundosReintento(cabecera: string | null): number | undefined {
  if (!cabecera) return undefined;
  const milisegundos = /^\d+$/.test(cabecera) ? Number(cabecera) * 1000 : Date.parse(cabecera) - Date.now();
  return Number.isSafeInteger(milisegundos) ? Math.max(0, milisegundos) : undefined;
}
