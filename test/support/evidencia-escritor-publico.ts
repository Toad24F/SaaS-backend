export interface GrupoEvidenciaEscritor {
  grupo: `T${number}`;
  descripcion: string;
  suites: string[];
  evidencias: string[];
}

/** Matriz ejecutable de la compuerta T097. Mantener las rutas explícitas hace
 * visible qué prueba real acredita cada grupo, sin contar demos ni dobles. */
export const EVIDENCIA_ESCRITOR_PUBLICO: GrupoEvidenciaEscritor[] = [
  { grupo: 'T05', descripcion: 'reloj y apartado',
    suites: ['test/fase-4-t065-t068.integration-spec.ts',
      'test/fase-4-t086-t091.integration-spec.ts'],
    evidencias: ['resultado-t065-t068.md', 'resultado-t086-t091.md'] },
  { grupo: 'T06', descripcion: 'reemplazo y salida',
    suites: ['test/fase-4-t058-t062.integration-spec.ts',
      'test/fase-4-t065-t068.integration-spec.ts'],
    evidencias: ['resultado-t058-t062.md', 'resultado-t065-t068.md'] },
  { grupo: 'T07', descripcion: 'precio e historia',
    suites: ['test/fase-4-t080-t085.e2e-spec.ts',
      'test/fase-4-t086-t091.integration-spec.ts'],
    evidencias: ['resultado-t080-t085.md', 'resultado-t086-t091.md'] },
  { grupo: 'T08', descripcion: 'registro atómico',
    suites: ['test/fase-4-t074-t079.integration-spec.ts',
      'test/fase-4-t080-t085.e2e-spec.ts',
      'test/fase-4-t092-t096.integration-spec.ts'],
    evidencias: ['resultado-t074-t079.md', 'resultado-t080-t085.md',
      'resultado-t092-t096.md'] },
  { grupo: 'T09', descripcion: 'idempotencia y recuperación',
    suites: ['test/fase-4-t072-t073.integration-spec.ts',
      'test/fase-4-t074-t079.integration-spec.ts',
      'test/fase-4-t080-t085.e2e-spec.ts',
      'test/fase-4-t092-t096.integration-spec.ts'],
    evidencias: ['resultado-t069-t073.md', 'resultado-t074-t079.md',
      'resultado-t080-t085.md', 'resultado-t092-t096.md'] },
  { grupo: 'T10', descripcion: 'migraciones',
    suites: ['test/fase-4-t008-t013.integration-spec.ts',
      'test/fase-4-t014-t019.integration-spec.ts',
      'test/instalacion-t126-t127.integration-spec.ts'],
    evidencias: ['resultado-t008-t013.md', 'resultado-t014-t019.md',
      'resultado-t020-t024.md'] },
  { grupo: 'T11', descripcion: 'carreras de dominio',
    suites: ['test/fase-4-t086-t091.integration-spec.ts',
      'test/fase-4-t092-t096.integration-spec.ts'],
    evidencias: ['resultado-t086-t091.md', 'resultado-t092-t096.md'] },
];

/** Dependencias normativas de T097; la prueba exige la casilla hecha antes de
 * permitir que la revisión se presente como aprobada. */
export const DEPENDENCIAS_T097 = [
  'M3-T065', 'M3-T066', 'M3-T067', 'M3-T068',
  'M3-T082', 'M3-T083', 'M3-T084', 'M3-T085',
  'M3-T087', 'M3-T088', 'M3-T089', 'M3-T090', 'M3-T091',
  'M3-T092', 'M3-T093', 'M3-T094', 'M3-T096',
] as const;

export const INTEGRACIONES_M2_ACREDITADAS = [
  'M2-I001', 'M2-I002', 'M2-I003', 'M2-I005',
  'M2-I006', 'M2-I007', 'M2-I008', 'M2-I009',
] as const;

export const INTEGRACION_DIFERIDA = 'M2-I004/M3-I001';
