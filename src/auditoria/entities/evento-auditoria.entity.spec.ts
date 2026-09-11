import { MODULE_METADATA } from '@nestjs/common/constants';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getMetadataArgsStorage } from 'typeorm';
import { AuditoriaModule } from '../auditoria.module';
import { EventoAuditoria } from './evento-auditoria.entity';

describe('Evento de auditoría (T13)', () => {
  it('representa operación, actor, destinos, acción y cambios', () => {
    const columnas = getMetadataArgsStorage().columns
      .filter((metadata) => metadata.target === EventoAuditoria)
      .map((metadata) => metadata.propertyName);

    expect(columnas).toEqual(expect.arrayContaining([
      'operacionId',
      'actorUsuarioId',
      'negocioId',
      'usuarioId',
      'licenciaId',
      'accion',
      'ocurridoEn',
      'valoresAntes',
      'valoresDespues',
    ]));
  });

  it('no define modalidades ni columnas destinadas a secretos', () => {
    const propiedades = getMetadataArgsStorage().columns
      .filter((metadata) => metadata.target === EventoAuditoria)
      .map((metadata) => metadata.propertyName.toLowerCase());

    expect(propiedades).not.toEqual(expect.arrayContaining([
      'modalidad',
      'password',
      'passwordhash',
      'codigo',
      'codigohash',
      'token',
    ]));
  });

  it('registra el repositorio desde el módulo independiente de auditoría', () => {
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AuditoriaModule) ?? [];
    expect(imports.some(
      (entrada: { providers?: Array<{ provide?: unknown }> }) =>
        entrada.providers?.some(
          (provider) => provider.provide === getRepositoryToken(EventoAuditoria),
        ),
    )).toBe(true);
  });
});
