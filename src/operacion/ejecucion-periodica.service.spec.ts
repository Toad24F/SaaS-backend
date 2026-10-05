import { EjecucionPeriodicaService } from './ejecucion-periodica.service';

describe('M1-T121–T122 ejecutor al arrancar y en cada ciclo', () => {
  it('concilia, detecta y drena pendientes; el reinicio vuelve a ejecutar', async () => {
    const orden: string[] = [];
    const conciliador = { conciliar: jest.fn(async () => { orden.push('conciliar'); return 1; }) };
    const avisos = { detectar: jest.fn(async () => { orden.push('avisos'); return 1; }) };
    let pendientes = 2;
    const correo = { procesarUno: jest.fn(async () => {
      orden.push('correo'); return pendientes-- > 0 ? { estado: 'enviado' } : null;
    }) };
    const reloj = { ahora: () => new Date('2026-10-05T12:00:00Z') };
    // El temporizador usa el mismo ciclo que el arranque; se detiene al cerrar.
    const primero = new EjecucionPeriodicaService(conciliador as never, avisos as never,
      correo as never, reloj, true);
    await primero.onApplicationBootstrap();
    await primero.onModuleDestroy();
    expect(orden).toEqual(['conciliar', 'avisos', 'correo', 'correo', 'correo']);
    pendientes = 1;
    const reiniciado = new EjecucionPeriodicaService(conciliador as never, avisos as never,
      correo as never, reloj, true);
    await reiniciado.onApplicationBootstrap();
    await reiniciado.onModuleDestroy();
    expect(orden.slice(5)).toEqual(['conciliar', 'avisos', 'correo', 'correo']);
  });
});
