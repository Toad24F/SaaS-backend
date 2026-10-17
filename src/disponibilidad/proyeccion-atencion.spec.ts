import { BadRequestException } from '@nestjs/common';
import { proyectarAtencion, cabeEnAtencion, iniciosAnclados,
  seleccionarFranjas } from './proyeccion-atencion';

const fecha = '2026-07-06';
const zona = 'America/Chihuahua';
const instante = (hora: string) => new Date(`2026-07-06T${hora}:00.000-06:00`);

describe('M2-T031/T032/T034–T038: atención interna con anclajes', () => {
  const semanal = (id: number, inicioMinutos: number, finMinutos: number,
    descansoInicioMinutos: number | null = null,
    descansoFinMinutos: number | null = null) => ({ id, sucursalId: 1,
      diaSemana: 1, inicioMinutos, finMinutos, descansoInicioMinutos,
      descansoFinMinutos });

  it('selecciona excepción por fecha/sucursal, incluida la vacía', () => {
    const semana = [semanal(1, 540, 660)];
    const excepciones = [{ sucursalId: 1, fechaLocal: fecha, franjas: [] },
      { sucursalId: 2, fechaLocal: fecha, franjas: [
        { id: 9, inicioMinutos: 600, finMinutos: 720,
          descansoInicioMinutos: null, descansoFinMinutos: null }] }];
    expect(seleccionarFranjas(fecha, 1, semana, excepciones)).toEqual([]);
    expect(seleccionarFranjas('2026-07-13', 1, semana, excepciones))
      .toMatchObject([{ id: 1, origen: 'semanal' }]);
    expect(seleccionarFranjas(fecha, 2, semana, excepciones))
      .toMatchObject([{ id: 9, origen: 'excepcion' }]);
  });

  it('conserva bloques independientes, cortes superpuestos y límites semiabiertos', () => {
    const semana = [semanal(1, 540, 660, 600, 607), semanal(2, 660, 780)];
    const restricciones = [
      { inicio: instante('10:00'), fin: instante('10:15') },
      { inicio: instante('10:05'), fin: instante('10:20') },
    ];
    const resultado = proyectarAtencion(fecha, 1, zona, semana, [], restricciones);
    expect(resultado.bloques).toHaveLength(2);
    expect(resultado.bloques.map((b) => [b.id, b.inicioUtc.toISOString().slice(11, 16)]))
      .toEqual([[1, '15:00'], [2, '17:00']]);
    expect(resultado.tramos.map((t) => [t.bloque.id, t.inicioUtc.toISOString().slice(11, 16),
      t.finUtc.toISOString().slice(11, 16)]))
      .toEqual([[1, '15:00', '16:00'], [1, '16:20', '17:00'], [2, '17:00', '19:00']]);
    expect(cabeEnAtencion(resultado.tramos, 1, instante('10:30'), instante('11:30')))
      .toBe(true);
    expect(cabeEnAtencion(resultado.tramos, 1, instante('10:30'), instante('11:00')))
      .toBe(true);
    expect(cabeEnAtencion(resultado.tramos, 1, instante('10:30'), instante('11:31')))
      .toBe(true);
    expect(cabeEnAtencion(resultado.tramos, 1, instante('09:59'), instante('10:00')))
      .toBe(true);
    expect(cabeEnAtencion(resultado.tramos, 1, instante('09:59'), instante('10:01')))
      .toBe(false);
    expect(cabeEnAtencion(resultado.tramos, 1, instante('09:30'), instante('10:01')))
      .toBe(false);
    expect(cabeEnAtencion(resultado.tramos, 1, instante('10:20'), instante('11:30')))
      .toBe(true);
    expect(cabeEnAtencion(resultado.tramos, 1, instante('10:19'), instante('11:30')))
      .toBe(false);
    expect(cabeEnAtencion(resultado.tramos, 2, instante('11:00'), instante('11:30')))
      .toBe(false);
    const inicios = iniciosAnclados(resultado.bloques, resultado.tramos, 15, 30)
      .map((d) => d.toISOString().slice(11, 16));
    expect(inicios).toContain('16:30');
    expect(inicios).not.toContain('16:22');
    expect(inicios).toContain('17:00');
  });

  it('reutiliza reglas DST: omite recurrencia y rechaza hora explícita', () => {
    const semana = [semanal(1, 120, 210)];
    const fechaCambio = '2026-03-08';
    const ny = 'America/New_York';
    const recurrente = [{ ...semana[0], diaSemana: 0 }];
    const resultado = proyectarAtencion(fechaCambio, 1, ny, recurrente, [], []);
    expect(resultado.bloques).toEqual([]);
    expect(resultado.omisiones).toMatchObject([{ fechaLocal: fechaCambio,
      motivo: expect.stringMatching(/inexistente|repetida/) }]);
    expect(() => proyectarAtencion(fechaCambio, 1, ny, [], [{ sucursalId: 1,
      fechaLocal: fechaCambio, franjas: [{ id: 5, inicioMinutos: 120,
        finMinutos: 210, descansoInicioMinutos: null, descansoFinMinutos: null }] }], []))
      .toThrow(BadRequestException);
    const repetida = '2026-11-01';
    const recurrenciaOtono = [{ ...semana[0], diaSemana: 0,
      inicioMinutos: 60, finMinutos: 120 }];
    expect(proyectarAtencion(repetida, 1, ny, recurrenciaOtono, [], []).omisiones)
      .toHaveLength(1);
    expect(() => proyectarAtencion(repetida, 1, ny, [], [{ sucursalId: 1,
      fechaLocal: repetida, franjas: [{ id: 6, inicioMinutos: 60,
        finMinutos: 120, descansoInicioMinutos: null, descansoFinMinutos: null }] }], []))
      .toThrow(BadRequestException);
  });

  it('un descanso hasta 10:07 mantiene la secuencia original de 09:00', () => {
    const resultado = proyectarAtencion(fecha, 1, zona,
      [semanal(7, 540, 780, 570, 607)], [], []);
    const inicios = iniciosAnclados(resultado.bloques, resultado.tramos, 15, 30)
      .map((d) => d.toISOString().slice(11, 16));
    expect(inicios).toContain('16:15');
    expect(inicios).not.toContain('16:07');
    expect(inicios).not.toContain('16:22');
  });
});
