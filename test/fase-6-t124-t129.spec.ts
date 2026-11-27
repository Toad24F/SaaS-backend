import { LimpiezaFolioEventos1760000067000 } from '../src/database/migrations/1760000067000-LimpiezaFolioEventos';
import { RetiradaFolioCitas1760000068000 } from '../src/database/migrations/1760000068000-RetiradaFolioCitas';
import type { QueryRunner } from 'typeorm';

describe('M5-T125–T127: retirada conservadora del folio', () => {
  it('limpia únicamente la propiedad del evento y restablece la inmutabilidad', async () => {
    const consultas: string[] = [];
    const runner = { query: jest.fn(async (sql: string) => { consultas.push(sql); return []; }) } as unknown as QueryRunner;
    await new LimpiezaFolioEventos1760000067000().up(runner);
    expect(consultas.join('\n')).toMatch(/JSON_REMOVE\(valores_antes, '\$\.folio'\)/);
    expect(consultas.join('\n')).toMatch(/JSON_REMOVE\(valores_despues, '\$\.folio'\)/);
    expect(consultas.join('\n')).toMatch(/CREATE TRIGGER trg_ec_no_actualizar/);
    expect(consultas.join('\n')).toMatch(/CREATE TRIGGER trg_ec_no_borrar/);
    expect(consultas.findIndex(sql => sql.includes('DROP TRIGGER trg_ec_no_actualizar')))
      .toBeLessThan(consultas.findIndex(sql => sql.includes('JSON_REMOVE')));
  });

  it('retira el índice y la columna después de la limpieza', async () => {
    const consultas: string[] = [];
    const runner = { query: jest.fn(async (sql: string) => { consultas.push(sql); return []; }) } as unknown as QueryRunner;
    await new RetiradaFolioCitas1760000068000().up(runner);
    expect(consultas).toEqual(expect.arrayContaining([
      expect.stringMatching(/DROP INDEX uq_citas_folio/),
      expect.stringMatching(/DROP COLUMN folio/),
    ]));
  });

  it('restaura los triggers si falla la limpieza', async () => {
    const consultas: string[] = [];
    const runner = { query: jest.fn(async (sql: string) => {
      consultas.push(sql);
      if (sql.includes('UPDATE eventos_cita')) throw new Error('fallo de prueba');
      return [{ total: 0 }];
    }) } as unknown as QueryRunner;
    await expect(new LimpiezaFolioEventos1760000067000().up(runner)).rejects.toThrow('fallo de prueba');
    expect(consultas.filter(sql => sql.includes('CREATE TRIGGER'))).toHaveLength(2);
  });

  it('rechaza revertir cuando existen citas o eventos', async () => {
    const runner = { query: jest.fn(async () => [{ total: '1' }]) } as unknown as QueryRunner;
    await expect(new LimpiezaFolioEventos1760000067000().down(runner)).rejects.toThrow('corrección hacia delante');
    await expect(new RetiradaFolioCitas1760000068000().down(runner)).rejects.toThrow('corrección hacia delante');
  });
});
