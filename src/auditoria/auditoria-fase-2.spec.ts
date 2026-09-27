import type { EntityManager } from 'typeorm';
import { getMetadataArgsStorage } from 'typeorm';
import { AuditoriaService } from './auditoria.service';
import { EventoAuditoria } from './entities/evento-auditoria.entity';

describe('M1-T016: destinos nuevos y ausencia de secretos', () => {
  it('declara alta pendiente y recurso futuro como destinos', () => {
    const columnas = getMetadataArgsStorage().columns.filter(
      (item) => item.target === EventoAuditoria,
    ).map((item) => item.propertyName);
    expect(columnas).toEqual(expect.arrayContaining([
      'altaAdministradorId', 'recursoTipo', 'recursoId',
    ]));
  });

  it('rechaza datos secretos antes de llamar al repositorio', async () => {
    const save = jest.fn();
    const manager = { getRepository: jest.fn().mockReturnValue({ create: jest.fn(), save }) } as unknown as EntityManager;
    const datos = {
      operacionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', actorUsuarioId: 1,
      negocioId: 2, usuarioId: null, licenciaId: null, altaAdministradorId: 3,
      accion: 'alta_pendiente', valoresAntes: null,
      valoresDespues: { estado: 'pendiente', anidado: { codigoHash: 'secreto' } },
    };
    // La protección debe cubrir claves anidadas, no solo la raíz del evento.
    await expect(new AuditoriaService().registrar(manager, datos)).rejects.toThrow();
    expect(save).not.toHaveBeenCalled();
  });
});
