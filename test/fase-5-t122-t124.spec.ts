import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const modulo = resolve(process.cwd(), 'docs/fase-5-modulo-4');
const matrizPath = resolve(modulo, 'resultados-tareas/matriz-final-t123.md');
const guiaPath = resolve(modulo, 'operacion-recuperacion.md');

/** El cierre exige trazabilidad completa a archivos reales, no solo casillas marcadas. */
describe('M4-T122–T124: contratos de entrega documental', () => {
  it('traza cada RF local y los diez criterios una sola vez con evidencia local existente', () => {
    const matriz = readFileSync(matrizPath, 'utf8');
    const spec = readFileSync(resolve(modulo, 'spec.md'), 'utf8');
    const rf = [...spec.matchAll(/^- \*\*RF-(\d{2})\./gm)].map((fila) => fila[1]);
    expect([...matriz.matchAll(/^\| RF-(\d{2}) \|/gm)].map((fila) => fila[1])).toEqual(rf);
    expect([...matriz.matchAll(/^\| CF-(\d{2}) \|/gm)].map((fila) => fila[1]))
      .toEqual(Array.from({ length: 10 }, (_, i) => String(i + 1).padStart(2, '0')));
    // Cada fila distingue resultado y referencia ejecutable de los antecedentes históricos.
    for (const fila of matriz.split('\n').filter((linea) => /^\| (RF-|CF-|ALA-RF-)/.test(linea))) {
      expect(fila).toMatch(/Aprobado|Pendiente explícito/);
      expect(fila).toMatch(/\]\([^)]+\)/);
    }
    for (const enlace of matriz.matchAll(/\]\(([^)#]+)(?:#[^)]*)?\)/g)) {
      expect(existsSync(resolve(dirname(matrizPath), enlace[1]))).toBe(true);
    }
  });

  it('incluye separación, cupo y las tres integraciones sin cerrar el módulo público', () => {
    const matriz = readFileSync(matrizPath, 'utf8');
    for (const numero of [43, 44, 45, 56, 57, 58, 59, 60, 61, 62, 63]) {
      expect(matriz).toContain(`| ALA-RF-${numero} |`);
    }
    for (const id of ['ALA-I001', 'ALA-I002', 'ALA-I003', 'M2-I004', 'M3-I001']) {
      expect(matriz).toContain(id);
    }
    const tareasPublicas = readFileSync(resolve(modulo, '../fase-4-modulo-3/tareas.md'), 'utf8');
    expect(tareasPublicas).toContain('- [ ] **M3-T136');
  });

  it('describe recuperación con las rutas reales y mantiene explícita la frontera de despliegue', () => {
    const guia = readFileSync(guiaPath, 'utf8');
    const controlador = readFileSync(resolve(process.cwd(), 'src/citas/citas.controller.ts'), 'utf8');
    // Los tres pasos deben corresponder a las rutas que realmente ofrece el backend.
    for (const ruta of ['manuales/intentos', 'manuales/intentos/:clave/registrar', 'manuales/intentos/:clave/resolver']) {
      expect(controlador).toContain(`@Post('${ruta}')`);
      expect(guia).toContain(`/citas/${ruta}`);
    }
    for (const contrato of ['migration:run', 'no_registrado', '503', 'READ COMMITTED',
      'historiales', 'WhatsApp', 'PDF', 'pagos', 'producción']) expect(guia).toContain(contrato);
    for (const enlace of guia.matchAll(/\]\(([^)#]+)(?:#[^)]*)?\)/g)) {
      expect(existsSync(resolve(dirname(guiaPath), enlace[1]))).toBe(true);
    }
  });
});
