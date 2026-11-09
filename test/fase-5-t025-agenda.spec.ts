import { BadRequestException } from '@nestjs/common';
import { validarConsultaAgenda } from '../src/citas/consulta-agenda.entrada';
import { limiteCivilUtc, proyectarHorarioCita } from '../src/citas/horario-agenda';
import { ConsultaAgendaService } from '../src/citas/consulta-agenda.service';
import type { AccesoOperativoService } from '../src/citas/acceso-operativo.service';

const periodo = { desde: '2026-01-01', hasta: '2026-01-31' };

describe('M4-T025: entrada cerrada de agenda', () => {
  it('admite día, semana y 31 fechas, con paginación limitada por defecto', () => {
    for (const hasta of ['2026-01-01', '2026-01-07', '2026-01-31']) {
      expect(validarConsultaAgenda({ ...periodo, hasta })).toMatchObject({ pagina: 1, limite: 50 });
    }
    expect(validarConsultaAgenda({ desde: '2028-02-29', hasta: '2028-03-01', pagina: '2', limite: '100',
      sucursalId: '1', personalId: '2', estado: 'no_asistio', busqueda: '  Ana  ' }))
      .toMatchObject({ pagina: 2, limite: 100, sucursalId: 1, personalId: 2, busqueda: 'Ana' });
  });

  it.each([
    null, [], {}, { ...periodo, desde: '2026-02-29' }, { ...periodo, hasta: '2026-02-01' },
    { ...periodo, desde: '2026-02-01' }, { ...periodo, desde: '2026-1-01' },
    { ...periodo, desde: '0000-01-01' }, { ...periodo, negocioId: '2' },
    { ...periodo, estado: 'inventado' }, { ...periodo, estado: ['pendiente'] },
    { ...periodo, sucursalId: '0' }, { ...periodo, personalId: '1 OR 1=1' },
    { ...periodo, personalId: 1 }, { ...periodo, pagina: '-1' },
    { ...periodo, pagina: '9007199254740991' }, { ...periodo, limite: '101' },
    { ...periodo, limite: '1.5' }, { ...periodo, busqueda: ['Ana'] },
    { ...periodo, busqueda: 'a'.repeat(151) }, { ...periodo, busqueda: 'Ana\u0000' },
  ])('rechaza entrada inválida sin abrir acceso: %j', async (entrada) => {
    const acceso = { ejecutar: jest.fn() };
    const agenda = new ConsultaAgendaService(acceso as unknown as AccesoOperativoService);
    expect(() => validarConsultaAgenda(entrada)).toThrow(BadRequestException);
    await expect(agenda.listar({ sub: 1, sesionId: 'sesion' }, entrada)).rejects.toMatchObject({ status: 400 });
    expect(acceso.ejecutar).not.toHaveBeenCalled();
  });
});

describe('M4-T028: fechas civiles y horario histórico', () => {
  it.each([
    ['2026-03-08', 'America/New_York', '2026-03-08T05:00:00.000Z', 23],
    ['2026-11-01', 'America/New_York', '2026-11-01T04:00:00.000Z', 25],
    ['2026-01-01', 'America/Phoenix', '2026-01-01T07:00:00.000Z', 24],
  ])('calcula inicio de %s en %s sin suponer días de 24 horas', (fecha, zona, esperado, horas) => {
    const siguiente = new Date(Date.parse(`${fecha}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
    expect(limiteCivilUtc(fecha, zona).toISOString()).toBe(esperado);
    expect(limiteCivilUtc(siguiente, zona).getTime() - limiteCivilUtc(fecha, zona).getTime()).toBe(horas * 3600000);
  });

  it('incluye una fecha civil con medianoche inexistente y una fecha omitida', () => {
    expect(limiteCivilUtc('2018-11-04', 'America/Sao_Paulo').toISOString()).toBe('2018-11-04T03:00:00.000Z');
    expect(limiteCivilUtc('2011-12-30', 'Pacific/Apia')).toEqual(limiteCivilUtc('2011-12-31', 'Pacific/Apia'));
  });

  it('encuentra la primera aparición de una fecha que retrocede al día anterior', () => {
    expect(limiteCivilUtc('2010-03-05', 'Antarctica/Casey').toISOString()).toBe('2010-03-04T13:00:00.000Z');
  });

  it('proyecta ambos extremos y sus fechas en la zona guardada, incluso al cruzar medianoche', () => {
    expect(proyectarHorarioCita({ inicioUtc: new Date('2026-02-01T06:45:00Z'),
      finUtc: new Date('2026-02-01T07:15:00Z'), zonaHorariaReserva: 'America/Phoenix' }))
      .toEqual({ fechaLocal: '2026-01-31', horaInicio: '23:45:00', fechaFinLocal: '2026-02-01',
        horaFin: '00:15:00', zonaHoraria: 'America/Phoenix' });
  });
});
