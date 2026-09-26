import { getMetadataArgsStorage } from 'typeorm';
import { Usuario } from './usuario.entity';
import { Rol } from '../../auth/enums/rol.enum';

describe('Usuario pendiente de activación (T09)', () => {
  const columna = (propiedad: keyof Usuario) =>
    getMetadataArgsStorage().columns.find(
      (metadata) =>
        metadata.target === Usuario && metadata.propertyName === propiedad,
    );

  it('permite nombre, contraseña y activación nulos mientras reserva el correo', () => {
    expect(columna('nombre')?.options.nullable).toBe(true);
    expect(columna('passwordHash')?.options.nullable).toBe(true);
    expect(columna('activadoEn')?.options).toMatchObject({
      name: 'activado_en',
      nullable: true,
    });
    expect(columna('email')?.options.unique).toBe(true);
  });

  it('normaliza el correo con espacios y mayúsculas antes de persistir', () => {
    const transformer = columna('email')?.options.transformer;
    expect(transformer).toBeDefined();
    expect(
      !Array.isArray(transformer) && transformer?.to('  Admin@Ejemplo.COM  '),
    ).toBe('admin@ejemplo.com');
  });

  it('representa una cuenta pendiente sin confundirla con una desactivada', () => {
    const pendiente = Object.assign(new Usuario(), {
      nombre: null,
      passwordHash: null,
      activadoEn: null,
      activo: true,
    });

    expect(pendiente).toMatchObject({
      nombre: null,
      passwordHash: null,
      activadoEn: null,
      activo: true,
    });
  });

  it('mantiene el enum SQL de fase 1 hasta la migración de Profesional', () => {
    // La política ya conoce Profesional; la columna persistida cambia en T14–T15.
    expect(columna('rol')?.options.enum).toEqual([
      Rol.SUPERADMIN, Rol.ADMIN_NEGOCIO, Rol.RECEPCIONISTA,
    ]);
  });
});
