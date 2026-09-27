import { ForbiddenException } from '@nestjs/common';
import { Rol } from '../enums/rol.enum';
import { AutorizacionService, Permiso } from './autorizacion.service';
import { RelojPrueba } from '../../../test/support/reloj';
import { crearEscenarioModuloUno } from '../../../test/support/modulo-1';

describe('M1-T009: matriz de permisos de fase 2', () => {
  const servicio = new AutorizacionService();
  const datos = crearEscenarioModuloUno(new RelojPrueba(new Date('2026-09-25T12:00:00.000Z')));
  const [admin, recepcion, profesional] = datos.activo.usuarios;

  it.each([
    [Rol.SUPERADMIN, Permiso.GESTIONAR_LIMITE_SUCURSALES, true],
    [Rol.ADMIN_NEGOCIO, Permiso.GESTIONAR_CATALOGO, true],
    [Rol.ADMIN_NEGOCIO, Permiso.GESTIONAR_PROFESIONALES, true],
    [Rol.ADMIN_NEGOCIO, Permiso.GESTIONAR_HORARIO, true],
    [Rol.ADMIN_NEGOCIO, Permiso.GESTIONAR_BLOQUEOS, true],
    [Rol.PROFESIONAL, Permiso.GESTIONAR_HORARIO, true],
    [Rol.PROFESIONAL, Permiso.GESTIONAR_BLOQUEOS, true],
    [Rol.PROFESIONAL, Permiso.GESTIONAR_SERVICIOS_PROPIOS, true],
    [Rol.PROFESIONAL, Permiso.GESTIONAR_CATALOGO, false],
    [Rol.PROFESIONAL, Permiso.GESTIONAR_PROFESIONALES, false],
    [Rol.RECEPCIONISTA, Permiso.GESTIONAR_HORARIO, false],
    [Rol.RECEPCIONISTA, Permiso.GESTIONAR_CATALOGO, false],
    [Rol.ADMIN_NEGOCIO, Permiso.GESTIONAR_LIMITE_SUCURSALES, false],
  ])('aplica %s / %s', (rol, permiso, permitido) => {
    const accion = () => servicio.exigir(rol, permiso);
    if (permitido) expect(accion).not.toThrow();
    else expect(accion).toThrow(ForbiddenException);
  });

  it('permite al administrador sus recursos y rechaza un negocio ajeno', () => {
    expect(() => servicio.exigirSobreRecurso(admin, Permiso.GESTIONAR_CATALOGO,
      datos.activo.recursos[0])).not.toThrow();
    expect(() => servicio.exigirSobreRecurso(admin, Permiso.GESTIONAR_CATALOGO,
      datos.pendiente.recursos[0])).toThrow(ForbiddenException);
  });

  it('el Profesional solo gestiona sus servicios, horario y bloqueos propios', () => {
    for (const permiso of [Permiso.GESTIONAR_SERVICIOS_PROPIOS,
      Permiso.GESTIONAR_HORARIO, Permiso.GESTIONAR_BLOQUEOS]) {
      expect(() => servicio.exigirSobreRecurso(profesional, permiso,
        { negocioId: profesional.negocioId, usuarioId: profesional.id })).not.toThrow();
      expect(() => servicio.exigirSobreRecurso(profesional, permiso,
        { negocioId: profesional.negocioId, usuarioId: admin.id }))
        .toThrow(ForbiddenException);
      expect(() => servicio.exigirSobreRecurso(profesional, permiso,
        { negocioId: datos.pendiente.negocio.id, usuarioId: profesional.id }))
        .toThrow(ForbiddenException);
    }
    expect(() => servicio.exigirSobreRecurso(recepcion, Permiso.GESTIONAR_HORARIO,
      { negocioId: recepcion.negocioId, usuarioId: recepcion.id }))
      .toThrow(ForbiddenException);
    // Un bloqueo del equipo sigue vedado aunque incluya a este Profesional.
    expect(() => servicio.exigirSobreRecurso(profesional, Permiso.GESTIONAR_BLOQUEOS,
      { negocioId: profesional.negocioId!, usuarioId: profesional.id, alcanceEquipo: true }))
      .toThrow(ForbiddenException);
  });
});
