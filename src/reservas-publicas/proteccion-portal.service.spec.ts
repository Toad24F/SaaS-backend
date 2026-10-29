import type { Request } from 'express';
import { ProteccionPortalService, COOKIE_RESERVA } from './proteccion-portal.service';

function solicitud(origen: string | undefined, cabeceras: Record<string, string> = {}): Request {
  const valores: Record<string, string> = { ...cabeceras };
  if (origen) valores.origin = origen;
  return { headers: { cookie: valores.cookie },
    get: (nombre: string) => valores[nombre.toLowerCase()] } as unknown as Request;
}

describe('M3-T028: protección de mutaciones públicas', () => {
  const original = { origen: process.env.PORTAL_PUBLICO_ORIGEN,
    secreto: process.env.PORTAL_CSRF_SECRET };
  beforeEach(() => {
    process.env.PORTAL_PUBLICO_ORIGEN = 'https://citas.example.test';
    process.env.PORTAL_CSRF_SECRET = 'clave-portal-de-pruebas-distinta-y-larga';
  });
  afterAll(() => {
    process.env.PORTAL_PUBLICO_ORIGEN = original.origen;
    process.env.PORTAL_CSRF_SECRET = original.secreto;
  });

  it('exige origen exacto y cabecera de inicialización no simple', () => {
    const proteccion = new ProteccionPortalService();
    expect(() => proteccion.exigirInicializacion(solicitud('https://citas.example.test',
      { 'x-portal-inicializacion': '1' }))).not.toThrow();
    for (const origen of [undefined, 'https://ajeno.example.test',
      'https://citas.example.test.evil']) {
      expect(() => proteccion.exigirInicializacion(solicitud(origen,
        { 'x-portal-inicializacion': '1' }))).toThrow();
    }
    expect(() => proteccion.exigirInicializacion(
      solicitud('https://citas.example.test'))).toThrow();
  });

  it('liga el token CSRF a la credencial para futuras mutaciones y liberaciones', () => {
    const proteccion = new ProteccionPortalService();
    const cabecera = { 'x-csrf-token': proteccion.tokenCsrf('credencial-a') };
    expect(() => proteccion.exigirMutacion(solicitud('https://citas.example.test',
      cabecera), 'credencial-a')).not.toThrow();
    expect(() => proteccion.exigirMutacion(solicitud('https://citas.example.test',
      cabecera), 'credencial-b')).toThrow();
    expect(() => proteccion.exigirMutacion(solicitud('https://ajeno.example.test',
      cabecera), 'credencial-a')).toThrow();
  });

  it('rechaza cookies mal formadas o duplicadas sin elegir una identidad', () => {
    const proteccion = new ProteccionPortalService();
    const token = 'A'.repeat(43);
    expect(proteccion.leerCredencial(solicitud(undefined,
      { cookie: `${COOKIE_RESERVA}=${token}` }))).toBe(token);
    expect(proteccion.leerCredencial(solicitud(undefined,
      { cookie: 'preferencia=oscuro' }))).toBeNull();
    expect(() => proteccion.leerCredencial(solicitud(undefined,
      { cookie: `${COOKIE_RESERVA}=${token}; ${COOKIE_RESERVA}=${token}` }))).toThrow();
    expect(() => proteccion.leerCredencial(solicitud(undefined,
      { cookie: `${COOKIE_RESERVA}=corta` }))).toThrow();
  });
});
