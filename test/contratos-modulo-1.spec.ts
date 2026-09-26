import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const plan = readFileSync(resolve(process.cwd(), 'docs/fase-2-modulo-1/plan-modulo-1.md'), 'utf8');

describe('M1-T005: contratos HTTP previstos', () => {
  // Verifica rutas y decisiones observables antes de implementar controladores nuevos.
  it.each([
    ['POST /negocios', '`rfc`'],
    ['POST /auth/activar-administrador', 'correo'],
    ['PATCH /negocios/:id/correo-administrador', 'superadmin'],
    ['POST /negocios/:id/reintentar-envio', 'superadmin'],
    ['PUT /negocios/:id/limite-sucursales', 'superadmin'],
    ['POST /sucursales', 'admin_negocio'],
    ['POST /servicios', 'admin_negocio'],
    ['POST /profesionales', 'admin_negocio'],
    ['PUT /profesionales/:id/servicios', 'Profesional'],
    ['PUT /profesionales/:id/horario', 'último guardado válido'],
    ['PUT /profesionales/:id/excepciones/:fecha', 'sucursal'],
    ['POST /bloqueos', 'motivo'],
    ['GET /licencias/mi-vigencia', 'tiempo restante'],
  ])('documenta %s y su contrato mínimo', (ruta, requisito) => {
    const fila = plan.split('\n').find((linea) => linea.startsWith('| ') && linea.includes(ruta));
    expect(fila).toBeDefined();
    expect(fila).toContain(requisito);
  });

  it('explicita errores y ausencia de secretos en respuestas', () => {
    for (const codigo of ['400', '401', '403', '404', '409', '429']) {
      expect(plan).toContain(codigo);
    }
    expect(plan).toContain('ningún código utilizable');
    expect(plan).toContain('índice de franja');
  });
});
