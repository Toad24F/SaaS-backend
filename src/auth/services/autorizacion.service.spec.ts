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
    [Rol.ADMIN_NEGOCIO, Permiso.CONSULTAR_HORARIO, true],
    [Rol.PROFESIONAL, Permiso.CONSULTAR_HORARIO, true],
    [Rol.RECEPCIONISTA, Permiso.CONSULTAR_HORARIO, true],
    [Rol.SUPERADMIN, Permiso.CONSULTAR_HORARIO, false],
    [Rol.RECEPCIONISTA, Permiso.GESTIONAR_HORARIO, false],
    [Rol.RECEPCIONISTA, Permiso.GESTIONAR_BLOQUEOS, false],
  ])('aplica la matriz %s / %s', (rol, permiso, permitido) => {
    const operacion = () => servicio.exigir(rol, permiso);
    if (permitido) expect(operacion).not.toThrow();
    else expect(operacion).toThrow(ForbiddenException);
  });

  it('limita consulta de horario al negocio propio y al perfil propio del Profesional', () => {
    const recurso = { negocioId: 10, usuarioId: 20 };
    expect(() => servicio.exigirSobreRecurso({ id: 30, rol: Rol.RECEPCIONISTA,
      negocioId: 10 }, Permiso.CONSULTAR_HORARIO, recurso)).not.toThrow();
    expect(() => servicio.exigirSobreRecurso({ id: 30, rol: Rol.RECEPCIONISTA,
      negocioId: 11 }, Permiso.CONSULTAR_HORARIO, recurso)).toThrow(ForbiddenException);
    expect(() => servicio.exigirSobreRecurso({ id: 20, rol: Rol.PROFESIONAL,
      negocioId: 10 }, Permiso.CONSULTAR_HORARIO, recurso)).not.toThrow();
    expect(() => servicio.exigirSobreRecurso({ id: 21, rol: Rol.PROFESIONAL,
      negocioId: 10 }, Permiso.CONSULTAR_HORARIO, recurso)).toThrow(ForbiddenException);
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
