import { MODULE_METADATA } from '@nestjs/common/constants';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getMetadataArgsStorage } from 'typeorm';
import { UsuariosModule } from '../../usuarios/usuarios.module';
import { NegociosModule } from '../negocios.module';
import { Negocio } from './negocio.entity';

function registraRepositorio(modulo: typeof NegociosModule): boolean {
  const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, modulo) ?? [];
  return imports.some((entrada: { providers?: Array<{ provide?: unknown }> }) =>
    entrada.providers?.some(
      (provider) => provider.provide === getRepositoryToken(Negocio),
    ),
  );
}

describe('Entidad Negocio (T08)', () => {
  it('conserva identidad y contacto e incorpora activación nullable', () => {
    const columnas = getMetadataArgsStorage().columns
      .filter((columna) => columna.target === Negocio)
      .map((columna) => ({
        propiedad: columna.propertyName,
        nombre: columna.options.name,
        nullable: columna.options.nullable,
      }));

    expect(columnas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ propiedad: 'id' }),
        expect.objectContaining({ propiedad: 'nombre' }),
        expect.objectContaining({ propiedad: 'slug' }),
        expect.objectContaining({ propiedad: 'emailContacto' }),
        expect.objectContaining({ propiedad: 'telefonoContacto' }),
        expect.objectContaining({
          propiedad: 'activadoEn',
          nombre: 'activado_en',
          nullable: true,
        }),
        expect.objectContaining({ propiedad: 'creadoEn' }),
      ]),
    );
  });

  it('retira el estado y la suspensión independientes del negocio', () => {
    const propiedades = getMetadataArgsStorage().columns
      .filter((columna) => columna.target === Negocio)
      .map((columna) => columna.propertyName);

    expect(propiedades).not.toContain('estado');
    expect(propiedades).not.toContain('suspendidoEn');
  });

  it('registra el repositorio únicamente desde NegociosModule', () => {
    expect(registraRepositorio(NegociosModule)).toBe(true);
    expect(registraRepositorio(UsuariosModule)).toBe(false);
  });
});
