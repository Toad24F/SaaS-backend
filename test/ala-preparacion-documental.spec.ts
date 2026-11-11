import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const raiz = resolve(process.cwd(), 'docs/ajustes-licencias-administracion-agenda');
const leer = (archivo: string): string => readFileSync(resolve(raiz, archivo), 'utf8');

describe('ALA-T002, T003 y T007: preparación documental', () => {
  it('alinea el lenguaje y la precedencia aprobados sin atribuir implementación', () => {
    const constitucion = leer('constitucion.md');
    const spec = leer('spec.md');
    const plan = leer('plan.md');
    expect(constitucion).toContain('inhabilitación recuperable');
    expect(constitucion).toContain('alcance exclusivamente backend');
    expect(constitucion).not.toMatch(/\barchivad[oa]s?\b/i);
    // Los encabezados actuales registran la aprobación posterior a la preparación documental.
    // Aprobación normativa e implementación siguen siendo hechos distintos en las tres fuentes.
    for (const fuente of [constitucion, spec, plan]) {
      expect(fuente).toMatch(/^Estado: aprobad[ao][^\r\n]*8 de noviembre de 2026\./m);
      expect(fuente).not.toContain('pendiente de aprobación');
      expect(fuente).toMatch(/no acredita por sí sol[ao] implementación ni integración manual/);
    }
    expect(spec).toMatch(/^## Referencias y precedencia\r?$/m);
    expect(spec).toContain('Estos RF sustituyen únicamente las reglas incompatibles');
    for (const fuente of [constitucion, plan]) {
      expect(fuente).toContain('prevalecen sobre antecedentes incompatibles');
    }
    expect(plan).toContain('nueve rutas públicas y cinco privadas');
    // La evidencia histórica conserva el estado real del día de ejecución; no se reescribe al aprobar.
    expect(leer('resultados-tareas/resultado-t002-t007.md'))
      .toContain('Estado de constitución, spec y plan: propuesta pendiente de aprobación.');
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
