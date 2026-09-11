import { MODULE_METADATA } from '@nestjs/common/constants';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getMetadataArgsStorage } from 'typeorm';
import { LicenciasModule } from '../licencias.module';
import { Licencia } from './licencia.entity';

describe('Licencia anual (T10)', () => {
  it('pertenece de forma única a un negocio y contiene sus fechas de vigencia', () => {
    const columnas = getMetadataArgsStorage().columns
      .filter((metadata) => metadata.target === Licencia)
      .map((metadata) => ({
        propiedad: metadata.propertyName,
        nullable: metadata.options.nullable,
        unique: metadata.options.unique,
      }));

    expect(columnas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ propiedad: 'negocioId', unique: true }),
        expect.objectContaining({ propiedad: 'habilitadaEn', nullable: true }),
        expect.objectContaining({ propiedad: 'venceEn', nullable: true }),
        expect.objectContaining({ propiedad: 'suspendidaEn', nullable: true }),
        expect.objectContaining({ propiedad: 'creadoEn' }),
        expect.objectContaining({ propiedad: 'actualizadoEn' }),
      ]),
    );
  });

  it('no representa modalidad, plan ni un estado vencido persistido', () => {
    const propiedades = getMetadataArgsStorage().columns
      .filter((metadata) => metadata.target === Licencia)
      .map((metadata) => metadata.propertyName);

    expect(propiedades).not.toEqual(
      expect.arrayContaining(['modalidad', 'plan', 'estado', 'vencida']),
    );
  });

  it('registra el repositorio desde LicenciasModule', () => {
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, LicenciasModule) ?? [];
    const registrado = imports.some(
      (entrada: { providers?: Array<{ provide?: unknown }> }) =>
        entrada.providers?.some(
          (provider) => provider.provide === getRepositoryToken(Licencia),
        ),
    );

    expect(registrado).toBe(true);
  });
});
