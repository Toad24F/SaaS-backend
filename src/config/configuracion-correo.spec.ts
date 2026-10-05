import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DerivadorCodigo } from '../codigos/derivador-codigo';
import { verificarConfiguracionCorreo } from './configuracion-correo';

describe('M1-T123 configuración y rotación de correo', () => {
  const claves = { 1: 'clave-anterior-solo-de-prueba-1234567890',
    2: 'clave-actual-solo-de-prueba-0987654321' };
  const entorno = { JWT_SECRET: 'jwt-diferente-solo-de-prueba-1234567890',
    CODIGOS_HMAC_VERSION_ACTUAL: '2', CODIGOS_HMAC_CLAVES: JSON.stringify(claves),
    CORREO_REMITENTE: 'sistema@example.test', SMTP_HOST: 'smtp.example.test',
    SMTP_USER: 'usuario-prueba', SMTP_PASS: 'clave-smtp-solo-de-prueba' };

  it('mantiene una emisión anterior al rotar y documenta variables sin secretos utilizables', () => {
    expect(() => verificarConfiguracionCorreo(entorno)).not.toThrow();
    const datos = { emisionId: '11111111-1111-4111-8111-111111111111',
      nonce: 'a'.repeat(32), proposito: 'recuperacion', negocioId: 4,
      destinatarioTipo: 'usuario' as const, destinatarioId: 7,
      destinatarioVersion: 1, correo: 'admin@example.test', claveVersion: 1 };
    expect(new DerivadorCodigo(claves, 2).derivar(datos))
      .toBe(new DerivadorCodigo({ 1: claves[1] }, 1).derivar(datos));
    const ejemplo = readFileSync(join(process.cwd(), '.env.example'), 'utf8');
    for (const clave of ['JWT_SECRET', 'CODIGOS_HMAC_CLAVES',
      'CODIGOS_HMAC_VERSION_ACTUAL', 'CORREO_REMITENTE', 'SMTP_HOST',
      'SMTP_USER', 'SMTP_PASS']) expect(ejemplo).toContain(`${clave}=`);
  });

  it('rechaza clave activa ausente, clave compartida con JWT y transporte incompleto', () => {
    for (const cambio of [
      { CODIGOS_HMAC_CLAVES: JSON.stringify({ 1: claves[1] }) },
      { CODIGOS_HMAC_CLAVES: JSON.stringify({ ...claves, 2: entorno.JWT_SECRET }) },
      { SMTP_PASS: '' },
      { SMTP_PORT: '0' },
    ]) expect(() => verificarConfiguracionCorreo({ ...entorno, ...cambio })).toThrow();
  });
});
