import { getMetadataArgsStorage } from 'typeorm';
import { AltaAdministrador } from './alta-administrador.entity';
import { CorreoAcceso } from './correo-acceso.entity';

describe('M1-T012: invitación y titular exclusivo del correo', () => {
  // Comprueba la estructura de ambas entidades antes de conectar los flujos HTTP.
  const columnas = (entidad: Function) => getMetadataArgsStorage().columns
    .filter((item) => item.target === entidad);
  const checks = (entidad: Function) => getMetadataArgsStorage().checks
    .filter((item) => item.target === entidad).map((item) => item.expression);

  it('modela una invitación pendiente sin usuario ni credenciales ficticias', () => {
    const campos = columnas(AltaAdministrador).map((item) => item.propertyName);
    expect(campos).toEqual(expect.arrayContaining([
      'negocioId', 'correo', 'estado', 'usuarioCreadoId', 'creadoEn', 'activadoEn',
    ]));
    expect(campos).not.toEqual(expect.arrayContaining(['password', 'passwordHash']));
    expect(columnas(AltaAdministrador).find((item) => item.propertyName === 'usuarioCreadoId')
      ?.options.nullable).toBe(true);
    const transformer = columnas(AltaAdministrador).find((item) => item.propertyName === 'correo')
      ?.options.transformer;
    expect(!Array.isArray(transformer) && transformer?.to('  Admin@Example.Test '))
      .toBe('admin@example.test');
  });

  it('normaliza correo y exige un titular invitación o cuenta', () => {
    const campo = columnas(CorreoAcceso).find((item) => item.propertyName === 'correo');
    const transformer = campo?.options.transformer;
    expect(!Array.isArray(transformer) && transformer?.to('  ADMin@EXAMPLE.test  '))
      .toBe('admin@example.test');
    expect(checks(CorreoAcceso).join(' ')).toContain('alta_administrador_id IS NOT NULL');
    expect(checks(CorreoAcceso).join(' ')).toContain('usuario_id IS NOT NULL');
    expect(columnas(CorreoAcceso).map((item) => item.propertyName))
      .not.toEqual(expect.arrayContaining(['password', 'passwordHash']));
  });
});
