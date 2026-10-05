import { BadRequestException } from '@nestjs/common';
import { validarBloqueo } from './validar-bloqueo';

// Un fin horario anterior en otro día sigue formando un intervalo continuo válido.
const completo = { personalId: 1, sucursalId: 2, tipo: 'vacaciones',
  motivo: 'Descanso anual', fechaInicio: '2026-10-10', fechaFin: '2026-10-12',
  inicioMinutos: 600, finMinutos: 540 };

describe('T102 intervalo y datos de bloqueo', () => {
  it('admite un intervalo continuo de varios días y días completos inclusivos', () => {
    expect(validarBloqueo(completo).inicioMinutos).toBe(600);
    expect(validarBloqueo({ ...completo, inicioMinutos: null, finMinutos: null })
      .fechaFin).toBe('2026-10-12');
  });

  it.each([
    { tipo: '' }, { motivo: ' ' }, { fechaInicio: '2026-02-30' },
    { fechaFin: '2026-10-09' }, { inicioMinutos: 600, finMinutos: null },
    { inicioMinutos: null, finMinutos: 600 },
    { fechaFin: '2026-10-10', inicioMinutos: 600, finMinutos: 600 },
    { fechaFin: '2026-10-10', inicioMinutos: 601, finMinutos: 600 },
    { inicioMinutos: -1 }, { finMinutos: 1441 },
  ])('rechaza datos incompletos o intervalo inverso: %j', (cambio) => {
    expect(() => validarBloqueo({ ...completo, ...cambio }))
      .toThrow(BadRequestException);
  });
});
