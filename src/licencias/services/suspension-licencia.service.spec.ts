import { Licencia } from '../entities/licencia.entity';
import { EstadoAccesoLicencia, PoliticaAccesoLicenciaService } from './politica-acceso-licencia.service';

describe('Suspensión con periodo de gracia (T045–T050)', () => {
  const politica = new PoliticaAccesoLicenciaService();
  const instante = new Date('2026-09-01T12:00:00.000Z');
  const vigente = Object.assign(new Licencia(), {
    habilitadaEn: new Date('2026-01-01T12:00:00Z'),
    venceEn: new Date('2027-01-01T12:00:00Z'), suspendidaEn: null,
    suspensionSolicitadaEn: instante,
    bloqueoProgramadoEn: new Date(instante.getTime() + 48 * 60 * 60 * 1000),
    congeladaEn: null, remanenteMs: null,
  });

  it('mantiene acceso antes del bloqueo y lo niega en el instante límite', () => {
    expect(politica.estado(vigente, new Date(vigente.bloqueoProgramadoEn!.getTime() - 1)))
      .toBe(EstadoAccesoLicencia.VIGENTE);
    expect(politica.estado(vigente, vigente.bloqueoProgramadoEn!))
      .toBe(EstadoAccesoLicencia.SUSPENDIDA);
    expect(politica.estado(vigente, new Date(vigente.bloqueoProgramadoEn!.getTime() + 1)))
      .toBe(EstadoAccesoLicencia.SUSPENDIDA);
  });

  it('el vencimiento natural anterior prevalece sobre las 48 horas', () => {
    vigente.venceEn = new Date(instante.getTime() + 1000);
    expect(politica.estado(vigente, new Date(instante.getTime() + 1000)))
      .toBe(EstadoAccesoLicencia.VENCIDA);
  });

  it('distingue solicitud, congelación efectiva y remanente persistido', () => {
    expect(vigente.suspensionSolicitadaEn).toEqual(instante);
    expect(vigente.bloqueoProgramadoEn).toEqual(new Date(instante.getTime() + 172800000));
    expect(vigente.congeladaEn).toBeNull();
    expect(vigente.remanenteMs).toBeNull();
  });

  it('no permite activar una licencia inicial con suspensión solicitada', () => {
    const inicial = Object.assign(new Licencia(), {
      habilitadaEn: null, venceEn: null, suspendidaEn: null,
      suspensionSolicitadaEn: instante, bloqueoProgramadoEn: instante,
      congeladaEn: null, remanenteMs: null,
    });
    expect(politica.puedeActivarAdministrador(inicial, instante)).toBe(false);
  });
});
