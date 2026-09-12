import { ForbiddenException } from '@nestjs/common';
import { Rol } from '../enums/rol.enum';
import { AutorizacionService, Permiso } from './autorizacion.service';

describe('AutorizacionService (T30)', () => {
  const servicio = new AutorizacionService();

  it.each([
    [Rol.SUPERADMIN, Permiso.CREAR_NEGOCIO, true],
    [Rol.SUPERADMIN, Permiso.GESTIONAR_LICENCIA, true],
    [Rol.SUPERADMIN, Permiso.GESTIONAR_RECEPCIONISTAS, false],
    [Rol.ADMIN_NEGOCIO, Permiso.CREAR_NEGOCIO, false],
    [Rol.ADMIN_NEGOCIO, Permiso.GESTIONAR_RECEPCIONISTAS, true],
    [Rol.RECEPCIONISTA, Permiso.CREAR_NEGOCIO, false],
    [Rol.RECEPCIONISTA, Permiso.GESTIONAR_RECEPCIONISTAS, false],
  ])('aplica la matriz %s / %s', (rol, permiso, permitido) => {
    const operacion = () => servicio.exigir(rol, permiso);
    if (permitido) expect(operacion).not.toThrow();
    else expect(operacion).toThrow(ForbiddenException);
  });

  it('limita la gestión del administrador a su propio negocio', () => {
    expect(() => servicio.exigirNegocioPropio(Rol.ADMIN_NEGOCIO, 10, 10)).not.toThrow();
    expect(() => servicio.exigirNegocioPropio(Rol.ADMIN_NEGOCIO, 10, 11))
      .toThrow(ForbiddenException);
    expect(() => servicio.exigirNegocioPropio(Rol.RECEPCIONISTA, 10, 10))
      .toThrow(ForbiddenException);
  });

  it('solo deja al superadmin autorizar recuperación de administradores', () => {
    expect(() => servicio.exigirRecuperacionAdministrador(
      Rol.SUPERADMIN,
      Rol.ADMIN_NEGOCIO,
    )).not.toThrow();
    expect(() => servicio.exigirRecuperacionAdministrador(
      Rol.ADMIN_NEGOCIO,
      Rol.ADMIN_NEGOCIO,
    )).toThrow(ForbiddenException);
    expect(() => servicio.exigirRecuperacionAdministrador(
      Rol.SUPERADMIN,
      Rol.RECEPCIONISTA,
    )).toThrow(ForbiddenException);
  });
});
