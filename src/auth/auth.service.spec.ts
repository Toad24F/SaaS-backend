import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UsuariosService } from '../usuarios/usuarios.service';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Rol } from './enums/rol.enum';

describe('AuthService', () => {
  let service: AuthService;
  const findByEmailWithNegocio = jest.fn();
  const sign = jest.fn();

  beforeEach(async () => {
    findByEmailWithNegocio.mockReset();
    sign.mockReset().mockReturnValue('token-de-prueba');
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsuariosService, useValue: { findByEmailWithNegocio } },
        { provide: JwtService, useValue: { sign } },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('inicia sesión con credenciales válidas sin exponer el hash', async () => {
    findByEmailWithNegocio.mockResolvedValue({
      id: 1, email: 'admin@example.com', nombre: 'Admin', activo: true,
      rol: Rol.SUPERADMIN, negocioId: null,
      passwordHash: await bcrypt.hash('contraseña-de-prueba', 4),
    });
    const resultado = await service.login({ email: 'admin@example.com', password: 'contraseña-de-prueba' });
    expect(resultado.accessToken).toBe('token-de-prueba');
    expect(resultado.usuario).not.toHaveProperty('passwordHash');
    expect(sign).toHaveBeenCalledTimes(1);
  });

  it.each([null, { activo: false }])('rechaza cuentas inexistentes o inactivas: %s', async (usuario) => {
    findByEmailWithNegocio.mockResolvedValue(usuario);
    await expect(service.login({ email: 'nadie@example.com', password: 'incorrecta' }))
      .rejects.toBeInstanceOf(UnauthorizedException);
    expect(sign).not.toHaveBeenCalled();
  });

  it('rechaza una contraseña incorrecta', async () => {
    findByEmailWithNegocio.mockResolvedValue({ activo: true, passwordHash: await bcrypt.hash('correcta', 4) });
    await expect(service.login({ email: 'admin@example.com', password: 'incorrecta' }))
      .rejects.toBeInstanceOf(UnauthorizedException);
    expect(sign).not.toHaveBeenCalled();
  });
});
