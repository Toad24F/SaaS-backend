import { BadRequestException } from '@nestjs/common';
import { getMetadataArgsStorage } from 'typeorm';
import { Negocio } from './negocio.entity';
import { validarLimiteSucursales } from '../validar-limite-sucursales';

describe('M1-T011: datos comerciales y cupo de Negocio', () => {
  // Inspecciona los metadatos persistidos y el contrato de validación del cupo.
  const columna = (propiedad: keyof Negocio) => getMetadataArgsStorage().columns.find(
    (item) => item.target === Negocio && item.propertyName === propiedad,
  );

  it('declara RFC no único, destinatario y cupo inicial de uno', () => {
    expect(columna('rfc')?.options).toMatchObject({ name: 'rfc', unique: false, nullable: true });
    expect(columna('correoAdministrador')?.options).toMatchObject({
      name: 'correo_administrador', nullable: true,
    });
    expect(columna('limiteSucursalesActivas')?.options).toMatchObject({
      name: 'limite_sucursales_activas', default: 1,
    });
  });

  it.each([[undefined, 1], [1, 1], [2, 2], [100, 100]])(
    'admite cupo %s como %s', (entrada, esperado) => {
      expect(validarLimiteSucursales(entrada)).toBe(esperado);
    },
  );

  it.each([0, -1, 1.5, '2', null, Number.NaN, Number.POSITIVE_INFINITY])(
    'rechaza cupo inválido %s', (entrada) => {
      expect(() => validarLimiteSucursales(entrada)).toThrow(BadRequestException);
    },
  );
});
