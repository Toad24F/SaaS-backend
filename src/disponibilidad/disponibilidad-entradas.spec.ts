import { validarConfiguracionAgenda } from './configuracion-agenda.validador';
import { validarConsultaDisponibilidad, validarInicioPuntual } from './disponibilidad-entradas';

const query = { personalId: '1', sucursalId: '2', servicioId: '3',
  desde: '2026-07-01', hasta: '2026-07-31' };
const puntual = { personalId: 1, sucursalId: 2, servicioId: 3,
  fechaLocal: '2026-07-06', horaInicio: '10:07' };

// Protege el límite HTTP antes de que el motor lea datos del negocio.
describe('M2-T057–T059: entradas HTTP sin coerciones', () => {
  it('exige configuración completa, camelCase y sin propiedades ajenas', () => {
    const completa = { modo: 'ventana_libre', intervaloMinutos: 15,
      anticipacionMinutos: 15, diasFuturos: 60 };
    expect(validarConfiguracionAgenda(completa)).toEqual(completa);
    for (const mala of [{ ...completa, diasFuturos: undefined },
      { ...completa, dias_futuros: 60 }, { ...completa, intervaloMinutos: '15' },
      { ...completa, anticipacionMinutos: 2.5 }]) {
      expect(() => validarConfiguracionAgenda(mala)).toThrow();
    }
  });

  it('acepta 31 fechas inclusivas, modalidad por defecto y rechaza 32/inversión', () => {
    expect(validarConsultaDisponibilidad(query)).toEqual({ personalId: 1,
      sucursalId: 2, servicioId: 3, desde: query.desde, hasta: query.hasta,
      modalidad: 'publica' });
    expect(validarConsultaDisponibilidad({ ...query, modalidad: 'manual' }).modalidad)
      .toBe('manual');
    for (const mala of [{ ...query, hasta: '2026-08-01' },
      { ...query, desde: '2026-07-31', hasta: '2026-07-01' },
      { ...query, personalId: '1.5' }, { ...query, sucursalId: '0' },
      { ...query, servicioId: 'Infinity' }, { ...query, desde: '2026-02-30' },
      { ...query, modalidad: 'desconocida' }, { ...query, negocioId: '2' }]) {
      expect(() => validarConsultaDisponibilidad(mala)).toThrow();
    }
  });

  it('acepta minuto puntual y rechaza campos de apartado u horas DST inválidas', () => {
    expect(validarInicioPuntual(puntual, 'America/Chihuahua')).toMatchObject({
      ...puntual, modalidad: 'publica' });
    for (const mala of [{ ...puntual, apartadoId: 1 },
      { ...puntual, titularHash: 'x' }, { ...puntual, personalId: 0 },
      { ...puntual, horaInicio: '24:00' }, { ...puntual, horaInicio: '10:07:30' },
      { ...puntual, fechaLocal: '2026-02-30' }]) {
      expect(() => validarInicioPuntual(mala, 'America/Chihuahua')).toThrow();
    }
    expect(() => validarInicioPuntual({ ...puntual,
      fechaLocal: '2026-03-08', horaInicio: '02:30' }, 'America/New_York'))
      .toThrow();
    expect(() => validarInicioPuntual({ ...puntual,
      fechaLocal: '2026-11-01', horaInicio: '01:30' }, 'America/New_York'))
      .toThrow();
  });
});
