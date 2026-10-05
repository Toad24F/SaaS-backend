const CORREO = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;

/** Comprueba la configuración del ejecutor sin mostrar ni devolver secretos. */
export function verificarConfiguracionCorreo(entorno: Record<string, string | undefined>): void {
  const requerido = (nombre: string): string => {
    const valor = entorno[nombre];
    if (!valor?.trim()) throw new Error(`Falta configuración de correo: ${nombre}.`);
    return valor;
  };
  const jwt = requerido('JWT_SECRET');
  const version = Number(requerido('CODIGOS_HMAC_VERSION_ACTUAL'));
  let claves: unknown;
  try { claves = JSON.parse(requerido('CODIGOS_HMAC_CLAVES')); }
  catch { throw new Error('Configuración de claves de códigos inválida.'); }
  if (!claves || typeof claves !== 'object' || Array.isArray(claves) ||
    !Number.isSafeInteger(version) || version < 1) {
    throw new Error('Configuración de claves de códigos inválida.');
  }
  const entradas = Object.entries(claves);
  if (!entradas.length || !entradas.some(([numero]) => Number(numero) === version) ||
    entradas.some(([numero, clave]) => !/^[1-9]\d*$/.test(numero) ||
      typeof clave !== 'string' || clave.length < 32 || clave === jwt)) {
    throw new Error('Configuración de claves de códigos inválida.');
  }
  // SMTP y el remitente son independientes del JWT y de las claves HMAC.
  if (!CORREO.test(requerido('CORREO_REMITENTE')) ||
    !requerido('SMTP_HOST').trim() || !requerido('SMTP_USER').trim() ||
    !requerido('SMTP_PASS').trim()) {
    throw new Error('Configuración de correo inválida.');
  }
  // El transporte usa estos valores opcionales con los mismos límites al enviar.
  const puerto = Number(entorno.SMTP_PORT ?? '587');
  const espera = Number(entorno.SMTP_TIMEOUT_MS ?? '10000');
  const seguro = entorno.SMTP_SECURE ?? 'false';
  if (!Number.isInteger(puerto) || puerto < 1 || puerto > 65535 ||
    !Number.isInteger(espera) || espera < 1 || espera > 120000 ||
    !['true', 'false'].includes(seguro)) {
    throw new Error('Configuración de correo inválida.');
  }
}
