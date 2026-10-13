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

/** Todos los lectores del motor compartirán este manager y el mismo instante. */
export interface ContextoDisponibilidad {
  manager: EntityManager;
  ahora: Date;
  actorId: number;
  rol: Rol;
  negocioId: number;
  personalId: number;
}

/** Reconstruye acceso actual sin confiar en rol ni negocio incluidos en el token. */
@Injectable()
export class ContextoDisponibilidadService {
  constructor(
    private readonly autorizacion: AutorizacionService,
    private readonly politicaLicencia: PoliticaAccesoLicenciaService,
  ) {}

  async resolver(
    manager: EntityManager,
    token: Pick<JwtPayload, 'sub' | 'sesionId'>,
    personalId: number,
    ahora: Date,
  ): Promise<ContextoDisponibilidad> {
    if (!manager.queryRunner?.isTransactionActive) {
      throw new Error(
        'La lectura de disponibilidad requiere una transacción activa.',
      );
    }
    if (!Number.isSafeInteger(personalId) || personalId <= 0) {
      throw new BadRequestException('Profesional inválido.');
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
    // Un ID ajeno o inexistente produce el mismo 404; solo después se comprueba perfil propio.
    const perfil = await manager.getRepository(Personal).findOneBy({
      id: personalId,
      negocioId: actor.negocioId,
    });
    if (!perfil) throw new NotFoundException('Profesional no disponible.');
    if (actor.rol === Rol.PROFESIONAL && actor.id !== perfil.id) {
      throw new ForbiddenException('Profesional no autorizado.');
    }
    return {
      manager,
      ahora: new Date(ahora),
      actorId: actor.id,
      rol: actor.rol,
      negocioId: actor.negocioId,
      personalId: perfil.id,
    };
  }
}
