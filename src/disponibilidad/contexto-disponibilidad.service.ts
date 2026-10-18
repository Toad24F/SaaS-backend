import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { EntityManager, IsNull, LessThanOrEqual, MoreThan } from 'typeorm';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { Rol } from '../auth/enums/rol.enum';
import { Sesion } from '../auth/entities/sesion.entity';
import {
  AutorizacionService,
  Permiso,
} from '../auth/services/autorizacion.service';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { Negocio } from '../negocios/entities/negocio.entity';
import { Licencia } from '../licencias/entities/licencia.entity';
import { PoliticaAccesoLicenciaService } from '../licencias/services/politica-acceso-licencia.service';
import { Personal } from '../profesionales/entities/personal.entity';

/** Datos mínimos del cálculo, independientes de JWT, rol o cookie. */
export interface ContextoCalculoDisponibilidad {
  manager: EntityManager;
  ahora: Date;
  negocioId: number;
  personalId: number;
}
/** La autorización privada conserva su actor y rol fuera del contrato común. */
export interface ContextoDisponibilidad extends ContextoCalculoDisponibilidad {
  actorId: number;
  rol: Rol;
}
export type ContextoPublicoDisponibilidad = ContextoCalculoDisponibilidad;
export type AccesoDisponibilidad = Omit<ContextoDisponibilidad, 'personalId'>;

/** Reconstruye acceso actual sin confiar en rol ni negocio incluidos en el token. */
@Injectable()
export class ContextoDisponibilidadService {
  constructor(
    private readonly autorizacion: AutorizacionService,
    private readonly politicaLicencia: PoliticaAccesoLicenciaService,
  ) {}

  /** Relee acceso y perfil en la transacción del cálculo o del escritor;
   * la autorización HTTP previa no sustituye esta comprobación. */
  async resolverPublico(manager: EntityManager, negocioId: number,
    personalId: number, ahora: Date): Promise<ContextoPublicoDisponibilidad> {
    if (!manager.queryRunner?.isTransactionActive) {
      throw new Error('La lectura pública requiere una transacción activa.');
    }
    if (!Number.isSafeInteger(negocioId) || negocioId <= 0 ||
      !Number.isSafeInteger(personalId) || personalId <= 0 ||
      !Number.isFinite(ahora.getTime())) {
      throw new BadRequestException('Contexto público inválido.');
    }
    const negocio = await manager.getRepository(Negocio).findOneBy({ id: negocioId });
    const licencia = await manager.getRepository(Licencia).findOneBy({ negocioId });
    if (!negocio || !licencia || !this.politicaLicencia.puedeAceptarReserva(
      negocio.activadoEn !== null, licencia, ahora)) {
      throw new NotFoundException('Portal no disponible para reservar.');
    }
    const perfil = await manager.getRepository(Personal)
      .findOneBy({ negocioId, id: personalId });
    if (!perfil) throw new NotFoundException('Profesional no disponible.');
    return { manager, ahora: new Date(ahora), negocioId, personalId: perfil.id };
  }

  async resolver(
    manager: EntityManager,
    token: Pick<JwtPayload, 'sub' | 'sesionId'>,
    personalId: number,
    ahora: Date,
  ): Promise<ContextoDisponibilidad> {
    if (!Number.isSafeInteger(personalId) || personalId <= 0) {
      throw new BadRequestException('Profesional inválido.');
    }
    const acceso = await this.resolverAcceso(manager, token, ahora);
    // Un ID ajeno o inexistente produce el mismo 404; solo después se comprueba perfil propio.
    const perfil = await manager.getRepository(Personal).findOneBy({
      id: personalId,
      negocioId: acceso.negocioId,
    });
    if (!perfil) throw new NotFoundException('Profesional no disponible.');
    if (acceso.rol === Rol.PROFESIONAL && acceso.actorId !== perfil.id) {
      throw new ForbiddenException('Profesional no autorizado.');
    }
    return { ...acceso, personalId: perfil.id };
  }

  /** Autoriza una lectura con varios perfiles sin escoger un perfil arbitrario. */
  async resolverAcceso(manager: EntityManager,
    token: Pick<JwtPayload, 'sub' | 'sesionId'>, ahora: Date):
    Promise<AccesoDisponibilidad> {
    if (!manager.queryRunner?.isTransactionActive) {
      throw new Error(
        'La lectura de disponibilidad requiere una transacción activa.',
      );
    }
    if (
      !token ||
      !Number.isSafeInteger(token.sub) ||
      token.sub <= 0 ||
      typeof token.sesionId !== 'string' ||
      !token.sesionId
    ) {
      throw new UnauthorizedException('Sesión no válida.');
    }
    // Revocación, vencimiento y estado de cuenta se leen en la misma instantánea.
    const sesion = await manager
      .getRepository(Sesion)
      .findOneBy({
        id: token.sesionId,
        usuarioId: token.sub,
        revocadaEn: IsNull(),
        creadaEn: LessThanOrEqual(ahora),
        expiraEn: MoreThan(ahora),
      });
    if (!sesion) throw new UnauthorizedException('Sesión no válida.');
    const actor = await manager
      .getRepository(Usuario)
      .findOneBy({ id: token.sub });
    if (!actor || !actor.activo || !actor.activadoEn || !actor.nombre) {
      throw new UnauthorizedException('Cuenta no disponible.');
    }
    // Superadmin y roles sin lectura operativa se deniegan antes de exponer referencias.
    this.autorizacion.exigir(actor.rol, Permiso.CONSULTAR_DISPONIBILIDAD);
    if (actor.negocioId === null)
      throw new ForbiddenException('Negocio no autorizado.');
    const negocio = await manager
      .getRepository(Negocio)
      .findOneBy({ id: actor.negocioId });
    const licencia = await manager
      .getRepository(Licencia)
      .findOneBy({ negocioId: actor.negocioId });
    if (
      !negocio ||
      !licencia ||
      !this.politicaLicencia.evaluarAccesoUsuario({
        cuentaActiva: actor.activo,
        cuentaActivada: actor.activadoEn !== null,
        negocioActivado: negocio.activadoEn !== null,
        licencia,
        ahora,
      }).permitido
    )
      throw new UnauthorizedException('Acceso actual no disponible.');
    return {
      manager,
      ahora: new Date(ahora),
      actorId: actor.id,
      rol: actor.rol,
      negocioId: actor.negocioId,
    };
  }
}
