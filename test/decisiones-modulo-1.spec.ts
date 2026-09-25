import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const carpeta = resolve(process.cwd(), 'docs', 'fase-2-modulo-1');
const leer = (archivo: string) => readFileSync(resolve(carpeta, archivo), 'utf8');

describe('decisiones confirmadas del módulo 1 (M1-T001–M1-T004)', () => {
  const plan = leer('plan-modulo-1.md');
  const spec = leer('spec-modulo-1.md');
  const tareas = leer('tareas-modulo-1.md');

  // Cada decisión debe quedar visible en ambos contratos y con ejemplos comprobables.
  it('fija el mínimo de cupo y distingue valores válidos e inválidos', () => {
    for (const documento of [plan, spec]) {
      expect(documento).toContain('Cupo mínimo: 1');
      expect(documento).toContain('0 inválido');
      expect(documento).toContain('1 y 2 válidos');
    }
  });

  it('rechaza horas locales excepcionales y omite solo la recurrencia afectada', () => {
    for (const documento of [plan, spec]) {
      expect(documento).toContain('2026-03-08 02:30');
      expect(documento).toContain('2026-11-01 01:30');
      expect(documento).toContain('ocurrencia recurrente afectada');
      expect(documento).toContain('sin desplazarla');
    }
  });

  it('permite borrar un registro sin uso conservando la auditoría técnica', () => {
    for (const documento of [plan, spec]) {
      expect(documento).toContain('auditoría técnica de alta');
      expect(documento).toContain('no impide el borrado');
      expect(documento).toContain('se conserva');
    }
  });

  it('confirma base nueva y mantiene separada cualquier conversión futura', () => {
    for (const documento of [plan, spec]) {
      expect(documento).toContain('base nueva');
      expect(documento).toContain('conversión de datos existentes');
    }
  });

  // El cierre exige la marca de cada tarea y una evidencia propia enlazada.
  it.each(['001', '002', '003', '004'])('cierra M1-T%s con evidencia', (numero) => {
    expect(tareas).toMatch(new RegExp(`- \\[x\\] \\*\\*M1-T${numero}`));
    expect(tareas).toContain('resultados-t001-t004.md');
  });
});
