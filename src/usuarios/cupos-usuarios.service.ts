import { BadRequestException, ConflictException, ForbiddenException, Injectable,
  NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { EntityManager } from 'typeorm';
import { DataSource, IsNull } from 'typeorm';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { Rol } from '../auth/enums/rol.enum';
import { Negocio } from '../negocios/entities/negocio.entity';
import { Usuario } from './entities/usuario.entity';

type RolConCupo = Rol.PROFESIONAL | Rol.RECEPCIONISTA;
type Limites = { profesionales: number; recepcionistas: number };

/** Un usuario consume a lo sumo un lugar, sin multiplicarlo por perfiles o sucursales. */
export async function contarCuentasActivas(manager: EntityManager, negocioId: number,
  rol: RolConCupo): Promise<number> {
  return manager.getRepository(Usuario).count({ where: {
    negocioId, rol, activo: true, inhabilitadoEn: IsNull(),
  } });
}

/** Se invoca después de bloquear la fila del negocio, antes de crear o activar. */
export async function exigirCupoDisponible(manager: EntityManager, negocioId: number,
  rol: RolConCupo): Promise<void> {
  const negocio = await manager.getRepository(Negocio).findOneBy({ id: negocioId });
  if (!negocio) throw new NotFoundException('Negocio no disponible.');
  const limite = rol === Rol.PROFESIONAL ? negocio.limiteProfesionalesActivos
    : negocio.limiteRecepcionistasActivos;
  if (await contarCuentasActivas(manager, negocioId, rol) >= limite) {
    throw new ConflictException(`No hay cupo para otra cuenta de ${rol}.`);
  }
}

/** Modificación administrativa y lectura coherente de ambos cupos. */
@Injectable()
export class CuposUsuariosService {
  private readonly auditoria = new AuditoriaService();
  constructor(private readonly db: DataSource) {}

  async consultar(negocioId: number) {
    return this.db.transaction('READ COMMITTED', async (manager) => {
      // La misma barrera serializa conteos con altas, reactivaciones y cambios de límite.
      const negocio = await this.bloquearNegocio(manager, negocioId);
      const [profesionales, recepcionistas] = await Promise.all([
        contarCuentasActivas(manager, negocioId, Rol.PROFESIONAL),
        contarCuentasActivas(manager, negocioId, Rol.RECEPCIONISTA),
      ]);
      return { profesionales: { limite: negocio.limiteProfesionalesActivos,
        activos: profesionales, disponibles: Math.max(0, negocio.limiteProfesionalesActivos - profesionales) },
      recepcionistas: { limite: negocio.limiteRecepcionistasActivos,
        activos: recepcionistas, disponibles: Math.max(0, negocio.limiteRecepcionistasActivos - recepcionistas) } };
    });
  }

  async cambiarLimites(actorId: number, negocioId: number, limites: Limites) {
    if (!Number.isSafeInteger(limites.profesionales) || limites.profesionales < 1 ||
      !Number.isSafeInteger(limites.recepcionistas) || limites.recepcionistas < 1) {
      throw new BadRequestException('Los límites deben ser enteros de al menos uno.');
    }
    return this.db.transaction('READ COMMITTED', async (manager) => {
      const actor = await manager.getRepository(Usuario).createQueryBuilder('actor')
        .setLock('pessimistic_read').where('actor.id = :id', { id: actorId }).getOne();
      if (!actor || actor.rol !== Rol.SUPERADMIN || !actor.activo) {
        throw new ForbiddenException('Acceso denegado.');
      }
      const negocio = await this.bloquearNegocio(manager, negocioId);
      const [profesionales, recepcionistas] = await Promise.all([
        contarCuentasActivas(manager, negocioId, Rol.PROFESIONAL),
        contarCuentasActivas(manager, negocioId, Rol.RECEPCIONISTA),
      ]);
      if (profesionales > limites.profesionales || recepcionistas > limites.recepcionistas) {
        throw new ConflictException('El límite no puede ser menor al consumo activo.');
      }
      const antes = { profesionales: negocio.limiteProfesionalesActivos,
        recepcionistas: negocio.limiteRecepcionistasActivos };
      if (antes.profesionales !== limites.profesionales ||
        antes.recepcionistas !== limites.recepcionistas) {
        // Los dos campos y la auditoría comparten commit; nunca se desactivan cuentas.
        await manager.getRepository(Negocio).update(negocioId, {
          limiteProfesionalesActivos: limites.profesionales,
          limiteRecepcionistasActivos: limites.recepcionistas,
        });
        await this.auditoria.registrar(manager, { operacionId: randomUUID(),
          actorUsuarioId: actor.id, negocioId, usuarioId: null, licenciaId: null,
          accion: 'limites_usuarios_modificados', valoresAntes: antes,
          valoresDespues: limites });
      }
      return { profesionales: { limite: limites.profesionales, activos: profesionales,
        disponibles: limites.profesionales - profesionales },
      recepcionistas: { limite: limites.recepcionistas, activos: recepcionistas,
        disponibles: limites.recepcionistas - recepcionistas } };
    });
  }

  private async bloquearNegocio(manager: EntityManager, negocioId: number) {
    const negocio = await manager.getRepository(Negocio).createQueryBuilder('negocio')
      .setLock('pessimistic_write').where('negocio.id = :id', { id: negocioId }).getOne();
    if (!negocio) throw new NotFoundException('Negocio no disponible.');
    return negocio;
  }
}
