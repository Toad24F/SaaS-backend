import type { EntityManager } from 'typeorm';
import { AuditoriaService } from './auditoria.service';

describe('Auditoría transaccional (T23)', () => {
  it('usa exclusivamente el repositorio del EntityManager recibido', async () => {
    const save = jest.fn().mockResolvedValue({ id: '1' });
    const create = jest.fn((valor) => valor);
    const manager = {
      getRepository: jest.fn().mockReturnValue({ create, save }),
    } as unknown as EntityManager;
    const servicio = new AuditoriaService();

    await servicio.registrar(manager, {
      operacionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      actorUsuarioId: 1,
      negocioId: 2,
      usuarioId: 3,
      licenciaId: null,
      accion: 'usuario_activado',
      valoresAntes: { activadoEn: null },
      valoresDespues: { activadoEn: '2026-09-11T18:00:00.000Z' },
    });

    expect(manager.getRepository).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      actorUsuarioId: 1,
      negocioId: 2,
      usuarioId: 3,
    }));
    expect(save).toHaveBeenCalledTimes(1);
  });
});
