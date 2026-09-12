import { ForbiddenException, Injectable } from '@nestjs/common';
import { Rol } from '../enums/rol.enum';

export enum Permiso {
  CREAR_NEGOCIO = 'crear_negocio',
  GESTIONAR_LICENCIA = 'gestionar_licencia',
  GESTIONAR_RECEPCIONISTAS = 'gestionar_recepcionistas',
  AUTORIZAR_RECUPERACION_ADMIN = 'autorizar_recuperacion_admin',
}

const PERMISOS_POR_ROL: Readonly<Record<Rol, ReadonlySet<Permiso>>> = {
  [Rol.SUPERADMIN]: new Set([
    Permiso.CREAR_NEGOCIO,
    Permiso.GESTIONAR_LICENCIA,
    Permiso.AUTORIZAR_RECUPERACION_ADMIN,
  ]),
  [Rol.ADMIN_NEGOCIO]: new Set([Permiso.GESTIONAR_RECEPCIONISTAS]),
  [Rol.RECEPCIONISTA]: new Set(),
};

/** Centraliza una matriz cerrada de permisos; lo no declarado se deniega. */
@Injectable()
export class AutorizacionService {
  exigir(rol: Rol, permiso: Permiso): void {
    if (!PERMISOS_POR_ROL[rol]?.has(permiso)) {
      throw new ForbiddenException('Acceso denegado: privilegios insuficientes.');
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
