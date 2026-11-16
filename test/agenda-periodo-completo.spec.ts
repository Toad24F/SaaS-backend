import { HttpException } from '@nestjs/common';
import { validarConsultaAgenda } from '../src/citas/consulta-agenda.entrada';
import { validarConsultaDisponibilidad } from '../src/disponibilidad/disponibilidad-entradas';
import { normalizarErrorOperativo } from '../src/citas/errores-operativos';
import { ConsultaAgendaDemasiadoAmpliaException } from '../src/citas/limites-agenda';

describe('Ajuste de agenda: periodo completo de hasta 42 fechas', () => {
  it.each(['2026-01-01', '2026-01-07', '2026-01-31', '2026-02-11'])('admite hasta %s sin campos de paginación', (hasta) => {
    expect(validarConsultaAgenda({ desde: '2026-01-01', hasta })).toEqual({ desde: '2026-01-01', hasta });
  });
  it.each([{ hasta: '2026-02-12' }, { pagina: '1' }, { limite: '100' }])('rechaza exceso o paginación obsoleta: %j', (cambio) => {
    expect(() => validarConsultaAgenda({ desde: '2026-01-01', hasta: '2026-01-31', ...cambio })).toThrow();
  });
  it('conserva 31 fechas en disponibilidad, sin ampliar el motor ni el portal', () => {
    const base = { personalId: '1', sucursalId: '1', servicioId: '1', desde: '2026-01-01' };
    expect(() => validarConsultaDisponibilidad({ ...base, hasta: '2026-01-31' })).not.toThrow();
    expect(() => validarConsultaDisponibilidad({ ...base, hasta: '2026-02-01' })).toThrow();
  });
  it('una excepción arbitraria no puede suplantar el mensaje especial del tope', () => {
    const error = normalizarErrorOperativo(new HttpException({ message: 'SQL teléfono privado', codigo: 'agenda_demasiado_amplia' }, 400));
    expect(JSON.stringify(error.getResponse())).not.toMatch(/SQL|privado|agenda_demasiado_amplia/);
    const seguro = normalizarErrorOperativo(new ConsultaAgendaDemasiadoAmpliaException());
    expect(normalizarErrorOperativo(seguro)).toBe(seguro);
    expect(seguro.getResponse()).toMatchObject({ codigo: 'agenda_demasiado_amplia', statusCode: 400 });
  });
});
