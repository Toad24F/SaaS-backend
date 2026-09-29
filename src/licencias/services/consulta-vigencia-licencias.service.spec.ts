import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Licencia } from '../entities/licencia.entity';
import { PoliticaAccesoLicenciaService } from './politica-acceso-licencia.service';
import { ConsultaVigenciaLicenciasService } from './consulta-vigencia-licencias.service';
import { VistaVigenciaLicenciaService } from './vista-vigencia-licencia.service';

describe('Consulta de vigencia (T056)', () => {
  const ahora = new Date('2026-09-28T12:00:00Z');
  const licencia = Object.assign(new Licencia(), { id: 2, negocioId: 8,
    habilitadaEn: new Date('2026-01-01Z'), venceEn: new Date('2027-01-01Z'),
    suspendidaEn: null, suspensionSolicitadaEn: null, bloqueoProgramadoEn: null,
    congeladaEn: null, remanenteMs: null });
  const findOneBy = jest.fn();
  const consulta = () => new ConsultaVigenciaLicenciasService(
    { findOneBy } as never, new PoliticaAccesoLicenciaService(), new VistaVigenciaLicenciaService(),
  );

  beforeEach(() => { findOneBy.mockReset().mockResolvedValue(licencia); });

  it('resuelve la consulta propia solo por negocio y devuelve la vista de servidor', async () => {
    await expect(consulta().propia(8, ahora)).resolves.toMatchObject({
      condicionAcceso: true, ahora: ahora.toISOString(), venceEn: licencia.venceEn!.toISOString(),
    });
    expect(findOneBy).toHaveBeenCalledWith({ negocioId: 8 });
  });

  it('rechaza la consulta propia al vencimiento o bloqueo exacto', async () => {
    licencia.bloqueoProgramadoEn = ahora;
    licencia.suspensionSolicitadaEn = new Date(ahora.getTime() - 1);
    await expect(consulta().propia(8, ahora)).rejects.toBeInstanceOf(UnauthorizedException);
    licencia.bloqueoProgramadoEn = null;
    licencia.suspensionSolicitadaEn = null;
    licencia.venceEn = ahora;
    await expect(consulta().propia(8, ahora)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('permite al superadmin consultar suspensión y oculta una licencia inexistente', async () => {
    licencia.congeladaEn = ahora;
    licencia.suspendidaEn = ahora;
    licencia.remanenteMs = '1000';
    await expect(consulta().porId(2, ahora)).resolves.toMatchObject({
      estado: 'suspendida', tiempoCongelado: true, venceEn: null,
    });
    findOneBy.mockResolvedValueOnce(null);
    await expect(consulta().porId(999, ahora)).rejects.toBeInstanceOf(NotFoundException);
  });
});
