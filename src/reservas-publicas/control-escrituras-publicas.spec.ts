import { exigirEscriturasPublicas } from './control-escrituras-publicas';

describe('M3-T126: interruptor operativo de nuevas escrituras', () => {
  const original = { estado: process.env.PORTAL_PUBLICO_ESCRITURAS,
    entorno: process.env.NODE_ENV };
  afterEach(() => {
    if (original.estado === undefined) delete process.env.PORTAL_PUBLICO_ESCRITURAS;
    else process.env.PORTAL_PUBLICO_ESCRITURAS = original.estado;
    if (original.entorno === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = original.entorno;
  });

  it('producción exige habilitación explícita y el cierre prevalece', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.PORTAL_PUBLICO_ESCRITURAS;
    expect(() => exigirEscriturasPublicas()).toThrow();
    process.env.PORTAL_PUBLICO_ESCRITURAS = 'habilitadas';
    expect(() => exigirEscriturasPublicas()).not.toThrow();
    process.env.PORTAL_PUBLICO_ESCRITURAS = 'cerradas';
    expect(() => exigirEscriturasPublicas()).toThrow();
  });
});
