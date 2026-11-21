import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const modulo = resolve('docs/fase-6-modulo-5');
const resultados = resolve(modulo, 'resultados-tareas');
const leer = (archivo: string) => readFileSync(resolve(resultados, archivo), 'utf8');

describe('M5-T001–T007: contratos de preparación', () => {
  it('conserva la precedencia, las referencias y las casillas históricas pendientes', () => {
    const nota = leer('dependencias-t001.md');
    for (const referencia of ['M3-T136', 'M3-I001', 'M2-I004', 'ALA-I001–ALA-I003',
      'READ COMMITTED', 'cupo telefónico', 'separación histórica']) {
      expect(nota).toContain(referencia);
    }
    // Los vínculos normativos deben existir en el repositorio.
    for (const [, enlace] of nota.matchAll(/\]\((\.\.?\/[^)#]+)(?:#[^)]*)?\)/g)) {
      expect(existsSync(resolve(resultados, enlace))).toBe(true);
    }
  });

  it('mapea en orden todos los RF y criterios sin acreditar su aceptación', () => {
    const spec = readFileSync(resolve(modulo, 'spec.md'), 'utf8');
    const tareas = readFileSync(resolve(modulo, 'tareas.md'), 'utf8');
    const plan = readFileSync(resolve(modulo, 'plan.md'), 'utf8');
    const matriz = leer('matriz-aceptacion-t002.md');
    const rf = [...spec.matchAll(/^- \*\*(RF-\d{2})\./gm)].map((fila) => fila[1]);
    const criterios = [...spec.split('## Criterios de finalización')[1].matchAll(/^(\d+)\. /gm)]
      .map((fila) => `CF-${fila[1].padStart(2, '0')}`);
    const filas = [...matriz.matchAll(/^\| ((?:RF|CF)-\d{2}) \| ([^|]+) \| ([^|]+) \| Pendiente \|$/gm)];
    expect(rf).toHaveLength(62);
    expect(criterios).toHaveLength(15);
    expect(filas.map((fila) => fila[1])).toEqual([...rf, ...criterios]);
    // Cada fila debe apuntar a trabajo y a un grupo de pruebas previstos.
    for (const [, , tareasPrevistas, pruebas] of filas) {
      const ids = tareasPrevistas.match(/M5-T\d{3}/g) ?? [];
      const grupos = pruebas.match(/\bT\d{2}\b/g) ?? [];
      expect(ids.length).toBeGreaterThan(0);
      expect(grupos.length).toBeGreaterThan(0);
      for (const id of ids) expect(tareas).toContain(`**${id} —`);
      for (const grupo of grupos) expect(plan).toContain(`| ${grupo} —`);
    }
  });

  it('registra las rutas previstas del plan y su frontera de errores', () => {
    const nota = leer('contratos-http-t005.md');
    const plan = readFileSync(resolve(modulo, 'plan.md'), 'utf8');
    const rutas = [...plan.matchAll(/\b(GET(?:\/PUT|\/POST)?|POST|PUT|PATCH) `?(\/[\w:/-]+)/g)];
    for (const [, metodos, ruta] of rutas) {
      for (const metodo of metodos.split('/')) expect(nota).toContain(`${metodo} ${ruta}`);
    }
    for (const codigo of [400, 401, 403, 404, 409, 500, 503]) {
      expect(nota).toContain(String(codigo));
    }
    expect(nota).toContain('no-store');
    expect(nota).toContain('Permiso');
    expect(nota).toContain('Entrada');
    expect(nota).toContain('Salida');
  });

  it('deja trazables la versión Graph, la firma y el consentimiento', () => {
    const nota = leer('proveedor-whatsapp-t006.md');
    for (const dato of [/v\d+\.0/, 'quick_reply', 'button.payload', 'X-Hub-Signature-256',
      'HMAC-SHA256', 'consentimiento', 'plantillas aprobadas']) {
      expect(nota).toMatch(dato);
    }
  });

  it('conserva formatos, límites y alternativa para el saneado raster', () => {
    const nota = leer('saneado-raster-t007.md');
    for (const dato of ['sharp', 'Jimp', 'Node.js', 'PNG', 'JPEG', 'WebP',
      '2 MiB', '2048 × 2048', 'animación', 'metadatos']) {
      expect(nota).toContain(dato);
    }
  });
});
