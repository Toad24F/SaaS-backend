import { getMetadataArgsStorage } from 'typeorm';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuthModule } from '../auth.module';
import { LimiteIntentos } from './limite-intentos.entity';

describe('Contador compartido de intentos (T14)', () => {
  it('usa la IP como única clave coordinable', () => {
    const origen = getMetadataArgsStorage().columns.find(
      (metadata) =>
        metadata.target === LimiteIntentos && metadata.propertyName === 'origen',
    );

    expect(origen?.options).toMatchObject({
      primary: true,
      length: 45,
    });
  });

  it('representa ventana, contador y bloqueo sin separar rutas o propósitos', () => {
    const propiedades = getMetadataArgsStorage().columns
      .filter((metadata) => metadata.target === LimiteIntentos)
      .map((metadata) => metadata.propertyName);

    expect(propiedades).toEqual(expect.arrayContaining([
      'origen',
      'ventanaInicio',
      'intentos',
      'bloqueadoHasta',
    ]));
    expect(propiedades).not.toEqual(expect.arrayContaining([
      'ruta',
      'endpoint',
      'proposito',
    ]));
  });

  it('registra un único repositorio compartido desde AuthModule', () => {
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AuthModule) ?? [];
    expect(imports.some(
      (entrada: { providers?: Array<{ provide?: unknown }> }) =>
        entrada.providers?.some(
          (provider) => provider.provide === getRepositoryToken(LimiteIntentos),
        ),
    )).toBe(true);
  });
});
