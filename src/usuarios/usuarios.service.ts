import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Usuario } from './entities/usuario.entity';
import { Rol } from '../auth/enums/rol.enum';

@Injectable()
export class UsuariosService {
  constructor(
    @InjectRepository(Usuario)
    private readonly usuarioRepository: Repository<Usuario>,
  ) {}

  // Busca el usuario con los datos de su negocio para validar estado
  async findByEmailWithNegocio(email: string): Promise<Usuario | null> {
    return this.usuarioRepository.findOne({
      where: { email },
      relations: {
        negocio: true,
      },
    });
  }

  async findById(id: number): Promise<Usuario | null> {
    return this.usuarioRepository.findOne({
      where: { id },
      relations: { negocio: true },
    });
  }

  /** Lista exclusivamente cuentas de recepción pertenecientes al tenant recibido. */
  listarRecepcionistas(negocioId: number): Promise<Usuario[]> {
    return this.usuarioRepository.find({
      where: { negocioId, rol: Rol.RECEPCIONISTA },
      order: { id: 'ASC' },
    });
  }

  async buscarRecepcionista(negocioId: number, usuarioId: number): Promise<Usuario> {
    const usuario = await this.usuarioRepository.findOneBy({
      id: usuarioId,
      negocioId,
      rol: Rol.RECEPCIONISTA,
    });
    if (!usuario) throw new NotFoundException('Usuario no disponible.');
    return usuario;
  }

  async desactivarRecepcionista(actorId: number, usuarioId: number): Promise<void> {
    await this.usuarioRepository.manager.transaction(async (manager) => {
      const actor = await manager.getRepository(Usuario).findOneBy({ id: actorId });
      if (!actor || actor.rol !== Rol.ADMIN_NEGOCIO || actor.negocioId === null) {
        throw new ForbiddenException('Acceso denegado.');
      }
      // La búsqueda compuesta evita revelar o modificar una cuenta de otro tenant.
      const destino = await manager.getRepository(Usuario).findOneBy({
        id: usuarioId, negocioId: actor.negocioId, rol: Rol.RECEPCIONISTA,
      });
      if (!destino) throw new NotFoundException('Usuario no disponible.');
      if (destino.activo) await manager.getRepository(Usuario).update(destino.id, { activo: false });
    });
  }
}
