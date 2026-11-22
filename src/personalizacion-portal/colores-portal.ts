import { BadRequestException } from '@nestjs/common';

export interface ColoresPortal {
  fondo: string;
  texto: string;
  acento: string;
}

export const COLORES_PREDETERMINADOS_PORTAL: Readonly<ColoresPortal> = Object.freeze({
  fondo: '#ffffff',
  texto: '#171717',
  acento: '#2164d8',
});

function luminancia(color: string): number {
  // WCAG mide luminancia en sRGB lineal. Cada canal tiene un peso perceptual distinto.
  const canales = [1, 3, 5].map((inicio) => {
    const normalizado = parseInt(color.slice(inicio, inicio + 2), 16) / 255;
    return normalizado <= 0.04045 ? normalizado / 12.92 : ((normalizado + 0.055) / 1.055) ** 2.4;
  });
  return canales[0] * 0.2126 + canales[1] * 0.7152 + canales[2] * 0.0722;
}

export function cumpleContraste(a: string, b: string, minimo: 3 | 4.5): boolean {
  const primera = luminancia(a);
  const segunda = luminancia(b);
  return (Math.max(primera, segunda) + 0.05) / (Math.min(primera, segunda) + 0.05) >= minimo;
}

function normalizarColor(valor: unknown, campo: keyof ColoresPortal): string {
  if (typeof valor !== 'string' || valor.length !== 7 || !/^#[0-9a-f]{6}$/i.test(valor)) {
    throw new BadRequestException(`El color de ${campo} debe ser hexadecimal opaco (#RRGGBB).`);
  }
  return valor.toLowerCase();
}

export function validarColoresPortal(entrada: ColoresPortal): ColoresPortal {
  const fondo = normalizarColor(entrada?.fondo, 'fondo');
  const texto = normalizarColor(entrada.texto, 'texto');
  const acento = normalizarColor(entrada.acento, 'acento');

  // El enlace lleva subrayado. Hover y pulsado mantienen los colores de la
  // pareja y marcan la interacción mediante cambios de subrayado o trazo.
  const parejas = [
    ['texto normal sobre fondo', texto, fondo, 4.5],
    ['texto grande sobre fondo', texto, fondo, 3],
    ['enlace sobre fondo', acento, fondo, 4.5],
    ['texto de botón sobre acento', fondo, acento, 4.5],
    ['borde del control sobre fondo', acento, fondo, 3],
    ['foco exterior sobre fondo', acento, fondo, 3],
    ['foco interior del botón sobre acento', texto, acento, 3],
  ] as const;
  const errores = parejas.filter(([, a, b, minimo]) => !cumpleContraste(a, b, minimo))
    .map(([uso, , , minimo]) => `${uso} (${minimo}:1)`);
  if (errores.length) throw new BadRequestException(`Revisa el contraste en ${errores.join(', ')}.`);

  // Solo estas tres claves pertenecen a la marca. Los estados usan su paleta semántica.
  return { fondo, texto, acento };
}
