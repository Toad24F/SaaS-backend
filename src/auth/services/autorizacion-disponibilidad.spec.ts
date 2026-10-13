import { AutorizacionService, Permiso } from './autorizacion.service';
import { Rol } from '../enums/rol.enum';

describe('M2-T026: permisos específicos de disponibilidad', () => {
  const autorizacion = new AutorizacionService();

  it('separa consultar, validar manualmente y configurar', () => {
    for (const rol of [Rol.ADMIN_NEGOCIO, Rol.RECEPCIONISTA, Rol.PROFESIONAL]) {
      expect(() => autorizacion.exigir(rol, Permiso.CONSULTAR_DISPONIBILIDAD)).not.toThrow();
      expect(() => autorizacion.exigir(rol, Permiso.VALIDAR_DISPONIBILIDAD_MANUAL))
        .not.toThrow();
    }
    expect(() => autorizacion.exigir(Rol.ADMIN_NEGOCIO, Permiso.CONFIGURAR_AGENDA))
      .not.toThrow();
    for (const rol of [Rol.RECEPCIONISTA, Rol.PROFESIONAL, Rol.SUPERADMIN]) {
      expect(() => autorizacion.exigir(rol, Permiso.CONFIGURAR_AGENDA)).toThrow();
    }
    for (const permiso of [Permiso.CONSULTAR_DISPONIBILIDAD,
      Permiso.VALIDAR_DISPONIBILIDAD_MANUAL]) {
      expect(() => autorizacion.exigir(Rol.SUPERADMIN, permiso)).toThrow();
    }
    expect(() => autorizacion.exigir(Rol.RECEPCIONISTA, Permiso.GESTIONAR_HORARIO))
      .toThrow();
  });

  it('limita al Profesional a su perfil sin elevar la recepción', () => {
    const propio = { id: 7, rol: Rol.PROFESIONAL, negocioId: 3 };
    expect(() => autorizacion.exigirSobreRecurso(propio,
      Permiso.CONSULTAR_DISPONIBILIDAD, { negocioId: 3, usuarioId: 7 }))
      .not.toThrow();
    expect(() => autorizacion.exigirSobreRecurso(propio,
      Permiso.CONSULTAR_DISPONIBILIDAD, { negocioId: 3, usuarioId: 8 }))
      .toThrow();
    expect(() => autorizacion.exigirSobreRecurso(propio,
      Permiso.CONSULTAR_DISPONIBILIDAD, { negocioId: 4, usuarioId: 7 }))
      .toThrow();
  });
});
