import { Licencia } from '../entities/licencia.entity';
import {
  EstadoAccesoLicencia,
  PoliticaAccesoLicenciaService,
} from './politica-acceso-licencia.service';

describe('Política de acceso por licencia (T22)', () => {
  const politica = new PoliticaAccesoLicenciaService();
  const ahora = new Date('2026-09-11T18:00:00.000Z');
  const licencia = (
    habilitadaEn: Date | null,
    venceEn: Date | null,
    suspendidaEn: Date | null = null,
  ) => Object.assign(new Licencia(), { habilitadaEn, venceEn, suspendidaEn });

  it.each([
    ['pendiente', licencia(null, null), EstadoAccesoLicencia.PENDIENTE],
    ['vigente', licencia(new Date('2026-01-01Z'), new Date('2027-01-01Z')), EstadoAccesoLicencia.VIGENTE],
    ['vencida', licencia(new Date('2025-01-01Z'), new Date(ahora)), EstadoAccesoLicencia.VENCIDA],
    ['suspendida', licencia(new Date('2026-01-01Z'), new Date('2027-01-01Z'), new Date('2026-06-01Z')), EstadoAccesoLicencia.SUSPENDIDA],
  ])('clasifica una licencia %s', (_nombre, valor, esperado) => {
    expect(politica.estado(valor, ahora)).toBe(esperado);
  });

  it.each([
    [true, true, true, true],
    [false, true, true, false],
    [true, false, true, false],
    [true, true, false, false],
  ])('evalúa cuenta activa=%s, activada=%s y negocio activado=%s', (
    cuentaActiva,
    cuentaActivada,
    negocioActivado,
    permitido,
  ) => {
    expect(politica.evaluarAccesoUsuario({
      cuentaActiva,
      cuentaActivada,
      negocioActivado,
      licencia: licencia(new Date('2026-01-01Z'), new Date('2027-01-01Z')),
      ahora,
    }).permitido).toBe(permitido);
  });

  it('permite activación inicial pendiente, pero bloquea cualquier activación suspendida', () => {
    expect(politica.puedeActivarAdministrador(licencia(null, null), ahora)).toBe(true);
    expect(politica.puedeActivarAdministrador(
      licencia(null, null, new Date('2026-01-01Z')),
      ahora,
    )).toBe(false);
    expect(politica.puedeActivarRecepcionista(
      licencia(new Date('2026-01-01Z'), new Date('2026-01-02Z')),
      ahora,
    )).toBe(false);
  });

  it('una suspensión prolongada sigue bloqueada sin consumir ni modificar vencimiento', () => {
    const suspendida = licencia(
      new Date('2025-01-01Z'),
      new Date('2026-02-01Z'),
      new Date('2025-02-01Z'),
    );
    const vencimiento = suspendida.venceEn!.getTime();
    expect(politica.estado(suspendida, new Date('2035-01-01Z')))
      .toBe(EstadoAccesoLicencia.SUSPENDIDA);
    expect(suspendida.venceEn!.getTime()).toBe(vencimiento);
  });

  it('bloquea nuevas reservas si negocio o licencia no permiten acceso', () => {
    const vigente = licencia(new Date('2026-01-01Z'), new Date('2027-01-01Z'));
    const suspendida = licencia(
      new Date('2026-01-01Z'),
      new Date('2027-01-01Z'),
      new Date('2026-06-01Z'),
    );
    expect(politica.puedeAceptarReserva(true, vigente, ahora)).toBe(true);
    expect(politica.puedeAceptarReserva(false, vigente, ahora)).toBe(false);
    expect(politica.puedeAceptarReserva(true, suspendida, ahora)).toBe(false);
  });
});
