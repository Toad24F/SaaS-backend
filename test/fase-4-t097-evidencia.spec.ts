import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DEPENDENCIAS_T097, EVIDENCIA_ESCRITOR_PUBLICO,
  INTEGRACION_DIFERIDA, INTEGRACIONES_M2_ACREDITADAS } from './support/evidencia-escritor-publico';

const raiz = process.cwd();
const resultados = resolve(raiz, 'docs/fase-4-modulo-3/resultados-tareas');
const tareas = readFileSync(resolve(raiz, 'docs/fase-4-modulo-3/tareas.md'), 'utf8');

describe('M3-T097: compuerta de evidencia del escritor público', () => {
  it('enumera exactamente T05–T11 con suites y evidencia existentes, sin omisiones', () => {
    expect(EVIDENCIA_ESCRITOR_PUBLICO.map((fila) => fila.grupo))
      .toEqual(['T05', 'T06', 'T07', 'T08', 'T09', 'T10', 'T11']);
    for (const fila of EVIDENCIA_ESCRITOR_PUBLICO) {
      expect(fila.suites.length).toBeGreaterThan(0);
      expect(fila.evidencias.length).toBeGreaterThan(0);
      for (const ruta of fila.suites) {
        expect(existsSync(resolve(raiz, ruta))).toBe(true);
        const fuente = readFileSync(resolve(raiz, ruta), 'utf8');
        // Una suite omitida no puede acreditar la habilitación del escritor.
        expect(fuente).not.toMatch(/(?:describe|it|test)\.skip\s*\(|\b(?:xdescribe|xit)\s*\(/);
        expect(fuente).toMatch(/\b(?:describe|it)\s*\(/);
      }
      for (const evidencia of fila.evidencias) {
        expect(existsSync(resolve(resultados, evidencia))).toBe(true);
      }
    }
  });

  it('exige que todas las dependencias de T097 estén terminadas', () => {
    for (const tarea of DEPENDENCIAS_T097) {
      expect(tareas).toContain(`- [x] **${tarea} `);
    }
  });

  it('acredita ocho integraciones públicas y conserva la manual como diferida', () => {
    const carreras = [
      readFileSync(resolve(resultados, 'resultado-t086-t091.md'), 'utf8'),
      readFileSync(resolve(resultados, 'resultado-t092-t096.md'), 'utf8'),
    ].join('\n');
    for (const integracion of INTEGRACIONES_M2_ACREDITADAS) {
      expect(carreras).toContain(integracion);
    }
    expect(carreras).toContain(INTEGRACION_DIFERIDA);
    // La revisión no puede convertir la reserva manual futura en evidencia actual.
    expect(INTEGRACIONES_M2_ACREDITADAS).not.toContain('M2-I004');
  });
});
