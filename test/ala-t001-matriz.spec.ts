import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const rutaMatriz = resolve(
  process.cwd(),
  'docs/ajustes-licencias-administracion-agenda/resultados-tareas/matriz-aceptacion-t001.md',
);
const rutaSpec = resolve(process.cwd(), 'docs/ajustes-licencias-administracion-agenda/spec.md');
const rutaPlan = resolve(process.cwd(), 'docs/ajustes-licencias-administracion-agenda/plan.md');

describe('ALA-T001: trazabilidad de la matriz de aceptación', () => {
  it('relaciona cada RF una sola vez con área, prueba y criterio de finalización', () => {
    const matriz = readFileSync(rutaMatriz, 'utf8');
    const spec = readFileSync(rutaSpec, 'utf8');
    const plan = readFileSync(rutaPlan, 'utf8');
    // Solo las filas de tabla con un RF individual cuentan como cobertura trazable.
    const filas = [...matriz.matchAll(/^\| RF-(\d{2}) \| (A0[1-8]) \| (T\d{2}(?:, T\d{2})*) \| ([1-8]) \|/gm)];
    const rfNormativos = [...spec.matchAll(/^- \*\*RF-(\d{2})\./gm)]
      .map((coincidencia) => Number(coincidencia[1]));
    expect(rfNormativos).toHaveLength(69);
    expect(filas.map((fila) => Number(fila[1]))).toEqual(rfNormativos);
    // El criterio 1 es transversal a todos los RF y se explica en el flujo de uso.
    expect(matriz).toContain('El criterio 1 exige además aprobación real');
    expect(matriz).toContain('| 1. Trazabilidad y aprobación |');
    expect(new Set(filas.map((fila) => fila[4]))).toEqual(
      new Set(['2', '3', '4', '5', '6', '7', '8']),
    );
    for (const fila of filas) {
      expect(plan).toContain(`${fila[2]} —`);
      for (const grupo of fila[3].split(', ')) {
        expect(plan).toContain(`${grupo} —`);
      }
    }
  });

  it('mantiene RF-63 y la integración manual explícitamente diferidos', () => {
    const matriz = readFileSync(rutaMatriz, 'utf8');
    expect(matriz).toMatch(/^\| RF-63 \| A07 \| T16 \| 7 \| Diferido:/m);
    expect(matriz).toContain('M3-I001/M2-I004');
    expect(matriz).toContain('escritor manual real');
    expect(matriz).toContain('propuesta pendiente de aprobación');
  });
});
