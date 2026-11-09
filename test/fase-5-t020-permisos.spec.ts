import { Rol } from '../src/auth/enums/rol.enum';
import { ForbiddenException } from '@nestjs/common';
import { AutorizacionService, Permiso } from '../src/auth/services/autorizacion.service';

const permisos = ['consultar_citas', 'consultar_clientes', 'gestionar_clientes',
  'crear_cita_manual', 'cambiar_estado_cita', 'cambiar_horario_cita'] as const;

describe('M4-T020: permisos operativos cerrados', () => {
  const autorizacion = new AutorizacionService();
  // Se ejercitan los valores públicos de los permisos, sin inferir herencia entre roles.
  it.each(Object.values(Rol).flatMap((rol) => permisos.map((permiso) => [rol, permiso] as const)))
   ('%s / %s', (rol, permiso) => {
      const permitido = rol === Rol.ADMIN_NEGOCIO || rol === Rol.RECEPCIONISTA
        || (rol === Rol.PROFESIONAL && permiso === 'consultar_citas');
      const ejecutar = () => autorizacion.exigir(rol, permiso as Permiso);
      if (permitido) expect(ejecutar).not.toThrow();
      else expect(ejecutar).toThrow();
    });

  it('deniega roles y permisos desconocidos', () => {
    for (const rol of ['inventado', '__proto__', 'constructor', 'toString']) {
      expect(() => autorizacion.exigir(rol as Rol, permisos[0] as Permiso)).toThrow(ForbiddenException);
    }
    expect(() => autorizacion.exigir(Rol.ADMIN_NEGOCIO, 'inventado' as Permiso)).toThrow(ForbiddenException);
  });
});
