import { getMetadataArgsStorage } from 'typeorm';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CodigosModule } from '../codigos.module';
import { CodigoAcceso, PropositoCodigoAcceso } from './codigo-acceso.entity';

describe('Código de acceso (T11)', () => {
  it('relaciona destinatario, emisor, propósito y ciclo de vida', () => {
    const propiedades = getMetadataArgsStorage().columns
      .filter((metadata) => metadata.target === CodigoAcceso)
      .map((metadata) => metadata.propertyName);

    expect(propiedades).toEqual(
      expect.arrayContaining([
        'usuarioId',
        'emisorUsuarioId',
        'proposito',
        'codigoHash',
        'emitidoEn',
        'expiraEn',
        'consumidoEn',
        'invalidadoEn',
      ]),
    );
    expect(Object.values(PropositoCodigoAcceso)).toEqual([
      'activacion_admin',
      'activacion_recepcionista',
      'recuperacion',
    ]);
  });

  it('almacena un hash único y nunca una columna con el código utilizable', () => {
    const columnas = getMetadataArgsStorage().columns.filter(
      (metadata) => metadata.target === CodigoAcceso,
    );
    const hash = columnas.find(
      (metadata) => metadata.propertyName === 'codigoHash',
    );

    expect(hash?.options).toMatchObject({
      name: 'codigo_hash',
      length: 64,
      unique: true,
      select: false,
    });
    expect(columnas.map((metadata) => metadata.propertyName)).not.toContain(
      'codigo',
    );
  });

  it('registra su repositorio desde CodigosModule', () => {
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, CodigosModule) ?? [];
    expect(imports.some(
      (entrada: { providers?: Array<{ provide?: unknown }> }) =>
        entrada.providers?.some(
          (provider) => provider.provide === getRepositoryToken(CodigoAcceso),
        ),
    )).toBe(true);
  });
});
