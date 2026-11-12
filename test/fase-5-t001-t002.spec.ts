import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const raiz = resolve(process.cwd(), 'docs/fase-5-modulo-4');
const leer = (nombre: string) => readFileSync(resolve(raiz, 'resultados-tareas', nombre), 'utf8');

describe('M4-T001–T002: preparación documental', () => {
  it('traza los 47 RF, ajustes y diez criterios sin atribuir aceptación funcional', () => {
    const matriz = leer('matriz-aceptacion-t001.md');
    const spec = readFileSync(resolve(raiz, 'spec.md'), 'utf8');
    const rf = [...spec.matchAll(/^- \*\*RF-(\d{2})\./gm)].map((m) => m[1]);
    const filas = [...matriz.matchAll(/^\| RF-(\d{2}) \| (M4-T\d{3}[^|]*) \| (T\d{2}[^|]*) \| Pendiente \|/gm)];
    expect(rf).toHaveLength(47);
    expect(filas.map((f) => f[1])).toEqual(rf);
    for (const numero of [3, 4, 5, 6, 7, 8, 43, 44, 45, 54, 56, 57, 58, 59, 60, 61, 62, 63]) {
      expect(matriz).toContain(`| ALA-RF-${String(numero).padStart(2, '0')} |`);
    }
    expect([...matriz.matchAll(/^\| CF-\d{2} \|/gm)]).toHaveLength(10);
    for (const id of ['ALA-I001', 'ALA-I002', 'ALA-I003', 'M2-I004', 'M3-I001']) {
      expect(matriz).toContain(id);
    }
    expect(matriz).toContain('Antecedentes');
    expect(matriz).toContain('Evidencia nueva');
    // Los enlaces locales deben apuntar a fuentes existentes; no se prueba solo texto suelto.
    for (const enlace of matriz.matchAll(/\]\(([^)#]+)(?:#[^)]*)?\)/g)) {
      expect(existsSync(resolve(raiz, 'resultados-tareas', enlace[1]))).toBe(true);
    }
  });

  it('identifica los contratos conservados y sus fuentes reales', () => {
    const inventario = leer('contratos-conservados-t002.md');
    for (const texto of ['Profesional', 'Superadmin', '0–30', 'READ COMMITTED',
      'GET /disponibilidad/configuracion', 'PUT /disponibilidad/configuracion',
      'GET /disponibilidad`', 'POST /disponibilidad/validar',
      'GET /disponibilidad/citas-afectadas', 'CupoTelefonicoService',
      'revalidarEnTransaccion', 'manual', 'separación', 'Pendiente']) {
      expect(inventario).toContain(texto);
    }
    for (const enlace of inventario.matchAll(/\]\(([^)#]+)(?:#[^)]*)?\)/g)) {
      expect(existsSync(resolve(raiz, 'resultados-tareas', enlace[1]))).toBe(true);
    }
  });
});
