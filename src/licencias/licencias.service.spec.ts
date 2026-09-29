import { AuditoriaService } from '../auditoria/auditoria.service';
import { Rol } from '../auth/enums/rol.enum';
import { AutorizacionService } from '../auth/services/autorizacion.service';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { Licencia } from './entities/licencia.entity';
import { LicenciasService } from './licencias.service';
import { CalendarioLicenciasService } from './services/calendario-licencias.service';

describe('Renovación anual durante suspensión (T051)', () => {
  const inicio = new Date('2026-02-28T12:00:00.000Z');
  const vence = new Date('2027-02-28T12:00:00.000Z');
  const bloqueo = new Date('2026-03-02T12:00:00.000Z');

  function servicio(estado: Partial<Licencia>) {
    const licencia = Object.assign(new Licencia(), {
      id: 1, negocioId: 8, habilitadaEn: inicio, venceEn: vence, suspendidaEn: bloqueo,
      suspensionSolicitadaEn: inicio, bloqueoProgramadoEn: bloqueo, congeladaEn: bloqueo,
      remanenteMs: String(vence.getTime() - bloqueo.getTime()), versionVencimiento: 1,
      ...estado,
    });
    const actor = Object.assign(new Usuario(), { id: 3, rol: Rol.SUPERADMIN });
    const repositorioLicencia = {
      createQueryBuilder: () => ({ setLock() { return this; }, where() { return this; }, getOne: async () => licencia }),
      save: jest.fn(async (valor: Licencia) => Object.assign(licencia, valor)),
    };
    const manager = {
      getRepository: (entidad: typeof Licencia | typeof Usuario) => entidad === Licencia
        ? repositorioLicencia : { findOneBy: async () => actor },
    };
    const repositorio = { manager: { transaction: (operacion: (tx: typeof manager) => unknown) => operacion(manager) } };
    const auditoria = { registrar: jest.fn().mockResolvedValue(undefined) };
    return { instancia: new LicenciasService(repositorio as never, new AutorizacionService(),
      new CalendarioLicenciasService(), auditoria as unknown as AuditoriaService), licencia, auditoria };
  }

  it('suma el año calendario al remanente y conserva la suspensión efectiva', async () => {
    const caso = servicio({});
    const restanteAntes = Number(caso.licencia.remanenteMs);
    const vencimientoAntes = caso.licencia.venceEn!;
    await caso.instancia.renovar(3, 1, new Date('2026-04-01T12:00:00.000Z'));
    const vencimientoNuevo = new CalendarioLicenciasService().sumarAnios(vencimientoAntes);
    expect(caso.licencia).toMatchObject({ suspendidaEn: bloqueo, congeladaEn: bloqueo,
      bloqueoProgramadoEn: bloqueo, venceEn: vencimientoNuevo });
    expect(Number(caso.licencia.remanenteMs)).toBe(restanteAntes + vencimientoNuevo.getTime() - vencimientoAntes.getTime());
    expect(caso.licencia.versionVencimiento).toBe(2);
    expect(caso.auditoria.registrar).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      accion: 'licencia_renovada',
    }));
  });

  it('renueva durante la gracia sin retirar ni reiniciar el bloqueo programado', async () => {
    const limite = new Date(inicio.getTime() + 48 * 60 * 60 * 1000);
    const caso = servicio({ suspendidaEn: null, congeladaEn: null, remanenteMs: null,
      suspensionSolicitadaEn: inicio, bloqueoProgramadoEn: limite });
    await caso.instancia.renovar(3, 1, new Date('2026-03-01T12:00:00.000Z'));
    expect(caso.licencia).toMatchObject({ suspendidaEn: null, congeladaEn: null,
      suspensionSolicitadaEn: inicio, bloqueoProgramadoEn: limite,
      venceEn: new CalendarioLicenciasService().sumarAnios(vence), remanenteMs: null });
  });

  it('suma un año a la fecha anual retenida al renovar después del vencimiento', async () => {
    const caso = servicio({ venceEn: new Date('2025-02-28T12:00:00.000Z'),
      remanenteMs: '0' });
    await caso.instancia.renovar(3, 1, new Date('2026-04-01T12:00:00.000Z'));
    expect(caso.licencia.venceEn).toEqual(new CalendarioLicenciasService()
      .sumarAnios(new Date('2025-02-28T12:00:00.000Z')));
    expect(caso.licencia.remanenteMs).toBe('0');
  });
});
