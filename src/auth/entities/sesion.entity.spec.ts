import { getMetadataArgsStorage } from 'typeorm';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuthModule } from '../auth.module';
import { Sesion } from './sesion.entity';

describe('Sesión persistida (T12)', () => {
  it('define identificador primario, usuario y fechas de ciclo de vida', () => {
    const columnas = getMetadataArgsStorage().columns
      .filter((metadata) => metadata.target === Sesion)
      .map((metadata) => ({
        propiedad: metadata.propertyName,
        primary: metadata.options.primary,
        nullable: metadata.options.nullable,
      }));

    expect(columnas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ propiedad: 'id', primary: true }),
        expect.objectContaining({ propiedad: 'usuarioId' }),
        expect.objectContaining({ propiedad: 'creadaEn' }),
        expect.objectContaining({ propiedad: 'expiraEn' }),
        expect.objectContaining({ propiedad: 'revocadaEn', nullable: true }),
      ]),
    );
  });

  it('relaciona la sesión con un único usuario', () => {
    const relacion = getMetadataArgsStorage().relations.find(
      (metadata) =>
        metadata.target === Sesion && metadata.propertyName === 'usuario',
    );

    expect(relacion?.relationType).toBe('many-to-one');
    expect(relacion?.options.nullable).toBe(false);
  });

  it('registra su repositorio desde AuthModule', () => {
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AuthModule) ?? [];
    expect(imports.some(
      (entrada: { providers?: Array<{ provide?: unknown }> }) =>
        entrada.providers?.some(
          (provider) => provider.provide === getRepositoryToken(Sesion),
        ),
    )).toBe(true);
  });
});
