import { BadRequestException } from '@nestjs/common';
import sharp from 'sharp';

const MAX_BYTES_LOGO = 2 * 1024 * 1024;
const MAX_DIMENSION_LOGO = 2048;
const FIRMA_PNG = Buffer.from('89504e470d0a1a0a', 'hex');

export interface LogoSaneado {
  contenido: Buffer;
  mime: 'image/webp';
  ancho: number;
  alto: number;
}

function formatoRaster(archivo: Buffer): 'png' | 'jpeg' | 'webp' | undefined {
  if (archivo.subarray(0, 8).equals(FIRMA_PNG)) return 'png';
  if (archivo[0] === 0xff && archivo[1] === 0xd8 && archivo[2] === 0xff) return 'jpeg';
  if (archivo.toString('ascii', 0, 4) === 'RIFF' && archivo.toString('ascii', 8, 12) === 'WEBP') return 'webp';
}

function errorDecodificacion() {
  return new BadRequestException('No se pudo decodificar el logo. Comprueba que el archivo esté completo.');
}

function rechazarAnimacion(): never {
  throw new BadRequestException('El logo debe ser una imagen sin animación.');
}

function comprobarContenedorPng(archivo: Buffer): void {
  // libvips puede leer el primer fotograma de APNG como PNG estático. Los
  // bloques del contenedor revelan la animación aunque el decodificador la omita.
  for (let posicion = FIRMA_PNG.length; posicion + 12 <= archivo.length;) {
    const longitud = archivo.readUInt32BE(posicion);
    const tipo = archivo.toString('ascii', posicion + 4, posicion + 8);
    posicion += longitud + 12;
    if (posicion > archivo.length) break;
    if (tipo === 'acTL' || tipo === 'fcTL' || tipo === 'fdAT') rechazarAnimacion();
    if (tipo === 'IEND' && longitud === 0) return;
  }
  throw errorDecodificacion();
}

function comprobarContenedorWebp(archivo: Buffer): void {
  if (archivo.readUInt32LE(4) + 8 > archivo.length) throw errorDecodificacion();
  // El indicador VP8X también detecta animaciones con un solo fotograma.
  if (archivo.toString('ascii', 12, 16) === 'VP8X' && (archivo[20] & 0x02)) rechazarAnimacion();
}

/** Valida el contenedor y decodifica todos los píxeles al recodificar el logo. */
export async function sanearLogoPortal(archivo: Buffer, mimeDeclarado: string): Promise<LogoSaneado> {
  if (archivo.length > MAX_BYTES_LOGO) throw new BadRequestException('El logo debe pesar como máximo 2 MiB.');
  const formato = formatoRaster(archivo);
  // La firma se evalúa antes de llamar al decodificador. SVG y otros tipos no pasan a sharp.
  if (!formato || mimeDeclarado !== `image/${formato}`) {
    throw new BadRequestException('El formato del logo debe coincidir con PNG, JPEG o WebP.');
  }
  if (formato === 'png') comprobarContenedorPng(archivo);
  if (formato === 'webp') comprobarContenedorWebp(archivo);

  const imagen = sharp(archivo, { failOn: 'warning', limitInputPixels: MAX_DIMENSION_LOGO ** 2 });
  const metadatos = await imagen.metadata().catch(() => { throw errorDecodificacion(); });
  if (metadatos.format !== formato) throw errorDecodificacion();
  if ((metadatos.pages ?? 1) > 1) rechazarAnimacion();
  if (metadatos.width > MAX_DIMENSION_LOGO || metadatos.height > MAX_DIMENSION_LOGO) {
    throw new BadRequestException('El logo debe medir como máximo 2048 × 2048 píxeles.');
  }

  // El WebP conserva transparencia y calidad de píxel. Sharp aplica la orientación
  // visual y descarta los metadatos originales al generar un archivo nuevo.
  const { data, info } = await imagen.autoOrient().webp({ lossless: true })
    .toBuffer({ resolveWithObject: true }).catch(() => { throw errorDecodificacion(); });
  if (data.length > MAX_BYTES_LOGO) throw new BadRequestException('El logo saneado supera 2 MiB.');
  return { contenido: data, mime: 'image/webp', ancho: info.width, alto: info.height };
}
