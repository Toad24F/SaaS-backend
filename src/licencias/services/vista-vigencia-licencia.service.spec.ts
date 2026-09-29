import { Licencia } from '../entities/licencia.entity';
import { VistaVigenciaLicenciaService } from './vista-vigencia-licencia.service';

describe('Vista de vigencia (T055)', () => {
  const vista = new VistaVigenciaLicenciaService();
  const ahora = new Date('2026-09-28T12:00:00.000Z');
  const base = (cambios: Partial<Licencia> = {}) => Object.assign(new Licencia(), {
    habilitadaEn: new Date('2026-01-01T12:00:00Z'),
    venceEn: new Date(ahora.getTime() + 49 * 60 * 60 * 1000),
    suspendidaEn: null, suspensionSolicitadaEn: null, bloqueoProgramadoEn: null,
    congeladaEn: null, remanenteMs: null, versionVencimiento: 1, ...cambios,
  });

  it('calcula días, horas y minutos hasta el vencimiento usando el reloj provisto', () => {
    expect(vista.crear(base(), ahora)).toMatchObject({
      estado: 'vigente', condicionAcceso: true,
      ahora: ahora.toISOString(), venceEn: new Date(ahora.getTime() + 49 * 60 * 60 * 1000).toISOString(),
      tiempoRestante: { dias: 2, horas: 1, minutos: 0 }, tiempoCongelado: false,
    });
  });

  it('distingue la suspensión pendiente y cuenta hasta el primer límite aplicable', () => {
    const bloqueo = new Date(ahora.getTime() + 47 * 60 * 60 * 1000);
    expect(vista.crear(base({ bloqueoProgramadoEn: bloqueo,
      suspensionSolicitadaEn: new Date(ahora.getTime() - 60_000) }), ahora)).toMatchObject({
      estado: 'suspension_pendiente', condicionAcceso: true,
      bloqueoProgramadoEn: bloqueo.toISOString(),
      tiempoRestante: { dias: 1, horas: 23, minutos: 0 },
    });
  });

  it('muestra tiempo congelado sin reutilizar la fecha de vencimiento como cuenta regresiva', () => {
    expect(vista.crear(base({ congeladaEn: new Date(ahora.getTime() - 1000),
      suspendidaEn: new Date(ahora.getTime() - 1000), remanenteMs: '90061000' }), ahora))
      .toMatchObject({ estado: 'suspendida', condicionAcceso: false, venceEn: null,
        tiempoCongelado: true, tiempoRestante: { dias: 1, horas: 1, minutos: 1 } });
  });

  it('reporta pendiente sin vencimiento y vencida con tiempo restante cero', () => {
    expect(vista.crear(base({ habilitadaEn: null, venceEn: null }), ahora))
      .toMatchObject({ estado: 'pendiente', venceEn: null, tiempoRestante: null });
    expect(vista.crear(base({ venceEn: ahora }), ahora))
      .toMatchObject({ estado: 'vencida', condicionAcceso: false,
        tiempoRestante: { dias: 0, horas: 0, minutos: 0 } });
  });
});
