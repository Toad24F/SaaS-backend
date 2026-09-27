import { ForbiddenException, Injectable } from '@nestjs/common';
import { Rol } from '../enums/rol.enum';

export enum Permiso {
  CREAR_NEGOCIO = 'crear_negocio',
  GESTIONAR_LICENCIA = 'gestionar_licencia',
  GESTIONAR_RECEPCIONISTAS = 'gestionar_recepcionistas',
  AUTORIZAR_RECUPERACION_ADMIN = 'autorizar_recuperacion_admin',
  GESTIONAR_LIMITE_SUCURSALES = 'gestionar_limite_sucursales',
  GESTIONAR_CATALOGO = 'gestionar_catalogo',
  GESTIONAR_PROFESIONALES = 'gestionar_profesionales',
  GESTIONAR_HORARIO = 'gestionar_horario',
  GESTIONAR_BLOQUEOS = 'gestionar_bloqueos',
  GESTIONAR_SERVICIOS_PROPIOS = 'gestionar_servicios_propios',
}

// La matriz es cerrada: ningún rol hereda facultades de otro por coincidencia de negocio.
const PERMISOS_POR_ROL: Readonly<Record<Rol, ReadonlySet<Permiso>>> = {
  [Rol.SUPERADMIN]: new Set([
    Permiso.CREAR_NEGOCIO,
    Permiso.GESTIONAR_LICENCIA,
    Permiso.AUTORIZAR_RECUPERACION_ADMIN,
    Permiso.GESTIONAR_LIMITE_SUCURSALES,
  ]),
  [Rol.ADMIN_NEGOCIO]: new Set([
    Permiso.GESTIONAR_RECEPCIONISTAS,
    Permiso.GESTIONAR_CATALOGO,
    Permiso.GESTIONAR_PROFESIONALES,
    Permiso.GESTIONAR_HORARIO,
    Permiso.GESTIONAR_BLOQUEOS,
    Permiso.GESTIONAR_SERVICIOS_PROPIOS,
  ]),
  [Rol.RECEPCIONISTA]: new Set(),
  [Rol.PROFESIONAL]: new Set([
    Permiso.GESTIONAR_HORARIO,
    Permiso.GESTIONAR_BLOQUEOS,
    Permiso.GESTIONAR_SERVICIOS_PROPIOS,
  ]),
};

export interface ActorAutorizado {
  id: number;
  rol: Rol;
  negocioId: number | null;
}

export interface RecursoAutorizado {
  negocioId: number;
  usuarioId?: number;
  alcanceEquipo?: boolean;
}

/** Centraliza una matriz cerrada de permisos; lo no declarado se deniega. */
@Injectable()
export class AutorizacionService {
  exigir(rol: Rol, permiso: Permiso): void {
    if (!PERMISOS_POR_ROL[rol]?.has(permiso)) {
      throw new ForbiddenException('Acceso denegado: privilegios insuficientes.');
    }
  }

  /** Comprueba la pertenencia actual y la propiedad personal además del rol. */
  exigirSobreRecurso(actor: ActorAutorizado, permiso: Permiso, recurso: RecursoAutorizado): void {
    this.exigir(actor.rol, permiso);
    if (actor.negocioId === null || actor.negocioId !== recurso.negocioId) {
      throw new ForbiddenException('Acceso denegado: negocio no autorizado.');
    }
    if (actor.rol === Rol.PROFESIONAL &&
      (recurso.alcanceEquipo || recurso.usuarioId === undefined || recurso.usuarioId !== actor.id)) {
      throw new ForbiddenException('Acceso denegado: Profesional no autorizado.');
    }
  }

  exigirNegocioPropio(rol: Rol, negocioActor: number | null, negocioDestino: number): void {
    this.exigir(rol, Permiso.GESTIONAR_RECEPCIONISTAS);
    if (negocioActor === null || negocioActor !== negocioDestino) {
      throw new ForbiddenException('Acceso denegado: negocio no autorizado.');
    }
  }

  exigirRecuperacionAdministrador(rolActor: Rol, rolDestino: Rol): void {
    this.exigir(rolActor, Permiso.AUTORIZAR_RECUPERACION_ADMIN);
    if (rolDestino !== Rol.ADMIN_NEGOCIO) {
      throw new ForbiddenException('La recuperación solo admite administradores.');
    }
  }
}
