import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const raiz = resolve(process.cwd(), 'docs/ajustes-licencias-administracion-agenda');
const leer = (archivo: string): string => readFileSync(resolve(raiz, archivo), 'utf8');

describe('ALA-T002, T003 y T007: preparación documental', () => {
  it('alinea el lenguaje y la precedencia sin dar la propuesta por aprobada', () => {
    const constitucion = leer('constitucion.md');
    const spec = leer('spec.md');
    const plan = leer('plan.md');
    expect(constitucion).toContain('inhabilitación recuperable');
    expect(constitucion).toContain('alcance exclusivamente backend');
    expect(constitucion).not.toMatch(/\barchivad[oa]s?\b/i);
    for (const fuente of [constitucion, spec, plan]) {
      expect(fuente).toContain('pendiente de aprobación');
    }
    expect(spec).toContain('Referencias y precedencia propuesta');
    expect(plan).toContain('nueve rutas públicas y cinco privadas');
  });

  it('enumera contratos retirados, nuevos y conservados con sus permisos', () => {
    const inventario = leer('resultados-tareas/inventario-contratos-t003.md');
    for (const referencia of ['DELETE', 'descansos', 'excepciones', 'intervaloMinutos',
      'tiempoEntreCitasMinutos', 'Idempotency-Key', 'intentoAnteriorId',
      'nueve rutas públicas', 'cinco rutas privadas', 'superadmin', 'administrador']) {
      expect(inventario).toContain(referencia);
    }
    // El inventario debe mencionar cada ruta pública y privada que seguirá disponible.
    expect((inventario.match(/^\| (?:GET|POST) \/publico\/negocios\/:slug\//gm) ?? [])).toHaveLength(9);
    expect((inventario.match(/^\| (?:GET|PUT|POST) \/disponibilidad(?:\/[^| ]+)? \|/gm) ?? [])).toHaveLength(5);
  });

  it('exige evidencia honesta de cada tarea, incluidas pruebas omitidas', () => {
    const ruta = resolve(raiz, 'resultados-tareas/plantilla-evidencia.md');
    expect(existsSync(ruta)).toBe(true);
    const plantilla = readFileSync(ruta, 'utf8');
    for (const campo of ['Revisión', 'RF', 'Comando o comprobación', 'Resultado',
      'Pruebas omitidas', 'Preparación documental', 'Funcionalidad acreditada']) {
      expect(plantilla).toContain(campo);
    }
  });
});
