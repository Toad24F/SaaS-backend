import { Test, TestingModule } from '@nestjs/testing';
import { UsuariosService } from './usuarios.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Usuario } from './entities/usuario.entity';

describe('UsuariosService', () => {
  let service: UsuariosService;
  const findOne = jest.fn();

  beforeEach(async () => {
    findOne.mockReset();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsuariosService,
        {
          provide: getRepositoryToken(Usuario),
          useValue: { findOne },
        },
      ],
    }).compile();

    service = module.get<UsuariosService>(UsuariosService);
  });

  it('consulta por ID junto con el negocio para validar la sesión', async () => {
    findOne.mockResolvedValue(null);
    await expect(service.findById(1)).resolves.toBeNull();
    expect(findOne).toHaveBeenCalledWith({
      where: { id: 1 },
      relations: { negocio: true },
    });
  });
});
