import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash, createHmac } from 'node:crypto';

export interface DatosDerivacion {
  emisionId: string;
  nonce: string;
  proposito: string;
  negocioId: number;
  destinatarioTipo: 'alta' | 'usuario';
  destinatarioId: number;
  destinatarioVersion: number;
  correo: string;
  claveVersion: number;
}

function clavesDelEntorno(): Record<number, string> {// Lee las claves de HMAC desde la variable de entorno CODIGOS_HMAC_CLAVES, que debe ser un objeto JSON con versiones y claves.
  if (!process.env.CODIGOS_HMAC_CLAVES) return {};
  let valor: unknown;
  try {
    valor = JSON.parse(process.env.CODIGOS_HMAC_CLAVES);
  } catch {
    throw new Error('CODIGOS_HMAC_CLAVES debe ser un objeto JSON válido.');
  }
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) {
    throw new Error('CODIGOS_HMAC_CLAVES debe ser un objeto de versiones y claves.');
  }
  const entradas = Object.entries(valor);
  for (const [version, clave] of entradas) {
    if (!Number.isSafeInteger(Number(version)) || Number(version) < 1 ||
      typeof clave !== 'string' || clave.length < 32) {
      throw new Error('Cada versión de clave debe ser positiva y tener al menos 32 caracteres.');
    }
  }
  return Object.fromEntries(entradas.map(([version, clave]) => [Number(version), clave]));// Convierte las claves a un objeto con claves numéricas.
}

/** Reconstruye un código solo con metadatos persistidos y una clave externa. */
@Injectable()
export class DerivadorCodigo {
  constructor(
    private readonly claves: Record<number, string> = clavesDelEntorno(),
    readonly versionActiva: number = Number(process.env.CODIGOS_HMAC_VERSION_ACTUAL ?? 1),
  ) { }

  tieneClaveActiva(): boolean {
    return Boolean(this.claves[this.versionActiva]);// Devuelve true si la clave activa está configurada y es válida.
  }

  derivar(datos: DatosDerivacion): string {// Deriva un código HMAC a partir de los datos y la clave correspondiente a la versión indicada.
    const clave = this.claves[datos.claveVersion];
    if (!clave || clave.length < 32 || clave === process.env.JWT_SECRET) {
      throw new BadRequestException('La clave de códigos solicitada no está configurada.');
    }// La clave no debe ser la misma que la de JWT, para evitar que se pueda derivar un código a partir de un token.
    // JSON fija el orden y separa los campos para evitar concatenaciones ambiguas.
    const contexto = JSON.stringify([// Se incluyen todos los campos que afectan a la derivación del código.
      datos.claveVersion, datos.proposito, datos.emisionId, datos.negocioId,
      datos.destinatarioTipo, datos.destinatarioId, datos.destinatarioVersion,
      datos.correo.trim().toLowerCase(), datos.nonce,
    ]);
    return createHmac('sha256', clave).update(contexto).digest('base64url');// Devuelve el código derivado en formato base64url, que es seguro para URLs y correos electrónicos.
  }

  hash(codigo: string): string {
    return createHash('sha256').update(codigo).digest('hex');// Devuelve el hash SHA-256 del código en formato hexadecimal, que es útil para almacenamiento seguro y comparación sin exponer el código original.
  }
}
