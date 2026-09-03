import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Usuario } from './entities/usuario.entity';

@Injectable()
export class UsuariosService {
    constructor(
        @InjectRepository(Usuario)
        private readonly usuarioRepository: Repository<Usuario>,
    ) { }

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
        return this.usuarioRepository.findOne({ where: { id } });
    }
}