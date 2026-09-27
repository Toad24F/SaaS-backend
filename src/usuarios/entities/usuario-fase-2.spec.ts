import { getMetadataArgsStorage } from 'typeorm';
import { Rol } from '../../auth/enums/rol.enum';
import { Usuario } from './usuario.entity';

describe('M1-T014: cuenta completa y Profesional', () => {
  // El contrato de entidad anticipa las restricciones que aplicará MariaDB.
  const columna = (nombre: keyof Usuario) => getMetadataArgsStorage().columns.find(
    (item) => item.target === Usuario && item.propertyName === nombre,
  );

  it('incluye Profesional y exige negocio para los roles de tenant', () => {
    expect(columna('rol')?.options.enum).toContain(Rol.PROFESIONAL);
    const checks = getMetadataArgsStorage().checks.filter((item) => item.target === Usuario);
    expect(checks.map((item) => item.expression).join(' ')).toContain("'profesional'");
  });

  it('conserva clave única para un administrador por negocio', () => {
    expect(columna('adminNegocioUnico')?.options).toMatchObject({ unique: true });
    expect(columna('adminNegocioUnico')?.options.asExpression).toContain("'admin_negocio'");
  });

  it('vincula una reserva de correo a la cuenta activada', () => {
    const indices = getMetadataArgsStorage().indices.filter((item) => item.target === Usuario);
    expect(indices.some((item) => item.columns.includes('negocioId'))).toBe(true);
    expect(columna('email')?.options.transformer).toBeDefined();
  });
});
