import { fusionarFranjas } from './fusion-franjas';

const franja = (inicioMinutos: number | null, finMinutos: number | null,
  extra: Record<string, unknown> = {}) => ({ diaSemana: 1, orden: 0,
    sucursalId: 7, inicioMinutos, finMinutos, activo: true, ...extra });

describe('ALA-T084: normalización de franjas semanales', () => {
  it('une transitivamente, conserva el menor ID y ordena la semana canónica', () => {
    expect(fusionarFranjas([
      franja(600, 660, { id: 12, orden: 2 }),
      franja(540, 600, { id: 9, orden: 1 }),
      franja(660, 720, { id: 15, orden: 3 }),
    ])).toEqual([franja(540, 720, { id: 9, orden: 0 })]);
  });

  it('no une huecos, otros días, sucursales, estados ni borradores incompletos', () => {
    const entrada = [franja(540, 600), franja(610, 660),
      franja(600, 660, { diaSemana: 2 }),
      franja(600, 660, { sucursalId: 8 }),
      franja(600, 660, { activo: false }),
      franja(660, null, { activo: false }),
      franja(null, 720, { activo: false })];
    expect(fusionarFranjas(entrada)).toHaveLength(entrada.length);
  });
});
