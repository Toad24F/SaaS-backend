import { Injectable, NotFoundException } from '@nestjs/common';
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
}
