import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { Rol } from '../auth/enums/rol.enum';
import { bloquearNegocioAgenda } from '../comun/bloqueos-coordinados';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { Negocio } from './entities/negocio.entity';

export interface CambiarPublicacionCatalogo {
  categoria?: string;
  telefono?: string;
  mostrarContactoPublico?: boolean;
  mostrarPreciosPublicos?: boolean;
}

/** La publicación es una opción global del negocio, no de cada servicio. */
@Injectable()
export class PublicacionCatalogoService {
  constructor(@InjectDataSource() private readonly db: DataSource,
    private readonly auditoria: AuditoriaService) {}

  async consultar(actorId: number) {
    return this.db.transaction('READ COMMITTED', async (manager) => {
      const actor = await this.actor(manager, actorId);
      // La lectura compartida espera una escritura pendiente sobre el mismo negocio.
      const negocio = await manager.getRepository(Negocio).createQueryBuilder('n')
        .setLock('pessimistic_read').where('n.id = :id', { id: actor.negocioId })
        .getOne();
      if (!negocio) throw new NotFoundException('Negocio no encontrado.');
      return this.presentar(negocio);
    });
  }

  async actualizar(actorId: number, datos: CambiarPublicacionCatalogo) {
    if (!datos || Object.values(datos).every((valor) => valor === undefined)) {
      throw new BadRequestException('Indica un campo de publicación.');
    }
    return this.db.transaction('READ COMMITTED', async (manager) => {
      const actor = await this.actor(manager, actorId);
      // Comparte la barrera de las escrituras de catálogo y oferta del negocio.
      await bloquearNegocioAgenda(manager, actor.negocioId!);
      const negocio = await manager.getRepository(Negocio).findOneBy({ id: actor.negocioId! });
      if (!negocio) throw new NotFoundException('Negocio no encontrado.');
      const antes = this.presentar(negocio);
      if (datos.categoria !== undefined) negocio.categoria = datos.categoria.trim() || null;
      if (datos.telefono !== undefined) negocio.telefonoContacto = datos.telefono.trim() || null;
      if (datos.mostrarContactoPublico !== undefined) {
        negocio.mostrarContactoPublico = datos.mostrarContactoPublico;
      }
      if (datos.mostrarPreciosPublicos !== undefined) {
        negocio.mostrarPreciosPublicos = datos.mostrarPreciosPublicos;
      }
      const despues = this.presentar(negocio);
      if (JSON.stringify(antes) === JSON.stringify(despues)) return despues;
      // Estado y evento se confirman juntos; un reintento idéntico no duplica auditoría.
      await manager.getRepository(Negocio).save(negocio);
      await this.auditoria.registrar(manager, { operacionId: randomUUID(),
        actorUsuarioId: actor.id, negocioId: negocio.id, usuarioId: null,
        licenciaId: null, accion: 'publicacion_catalogo_modificada',
        valoresAntes: antes, valoresDespues: despues });
      return despues;
    });
  }

  private async actor(manager: EntityManager, actorId: number): Promise<Usuario> {
    const actor = await manager.getRepository(Usuario).createQueryBuilder('u')
      .setLock('pessimistic_read').where('u.id = :actorId', { actorId }).getOne();
    if (!actor || actor.rol !== Rol.ADMIN_NEGOCIO || actor.negocioId === null ||
      !actor.activo || actor.inhabilitadoEn !== null || actor.activadoEn === null) {
      throw new ForbiddenException('Acceso denegado.');
    }
    return actor;
  }

  private presentar(negocio: Negocio) {
    // Lista permitida: nunca devolver licencia, correos ni campos internos del tenant.
    return { categoria: negocio.categoria, telefono: negocio.telefonoContacto,
      mostrarContactoPublico: negocio.mostrarContactoPublico,
      mostrarPreciosPublicos: negocio.mostrarPreciosPublicos };
  }
}
