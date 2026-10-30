import { TipoEnvioCorreo } from '../../correos/entities/envio-correo.entity';
import { claveAvisoLicencia } from './clave-aviso-licencia';

describe('ALA-T036: identidad lógica del aviso', () => {
  it('separa umbrales, ciclos y operaciones; repite la misma identidad', () => {
    // Cada referencia identifica un evento durable distinto, incluso para la misma licencia.
    const base = { negocioId: 3, licenciaId: 8 };
    const preventivo = (umbralDias: number) => claveAvisoLicencia({ ...base,
      tipo: TipoEnvioCorreo.AVISO_PREVENTIVO, versionVencimiento: 4, umbralDias });
    const ciclo = (versionSuspension: number) => claveAvisoLicencia({ ...base,
      tipo: TipoEnvioCorreo.SUSPENSION_EFECTIVA, versionSuspension });
    const operacion = (operacionLicenciaId: string) => claveAvisoLicencia({ ...base,
      tipo: TipoEnvioCorreo.LICENCIA_RENOVADA, operacionLicenciaId });
    expect(preventivo(15)).not.toBe(preventivo(7));
    expect(ciclo(1)).not.toBe(ciclo(2));
    expect(operacion('10')).not.toBe(operacion('11'));
    expect(ciclo(1)).toBe(ciclo(1));
    expect(claveAvisoLicencia({ ...base, tipo: TipoEnvioCorreo.LICENCIA_VENCIDA,
      versionVencimiento: 4 })).not.toBe(preventivo(15));
  });
});
