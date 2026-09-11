import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { Negocio } from '../../negocios/entities/negocio.entity';
import { Usuario } from '../../usuarios/entities/usuario.entity';
import { UsuariosService } from '../../usuarios/usuarios.service';
import { Rol } from '../enums/rol.enum';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let usuario: Usuario;
  const findById = jest.fn();
  const payload: JwtPayload = {
    sub: 1,
    email: 'anterior@example.com',
    nombre: 'Nombre anterior',
    rol: Rol.ADMIN_NEGOCIO,
    negocioId: 10,
  };

  beforeEach(async () => {
    findById.mockReset();
    usuario = Object.assign(new Usuario(), {
      id: 1,
      email: 'actual@example.com',
      nombre: 'Nombre actual',
      rol: Rol.RECEPCIONISTA,
      negocioId: 20,
      activo: true,
      activadoEn: new Date('2026-09-10T12:00:00Z'),
      passwordHash: 'hash-que-no-debe-exponerse',
      negocio: Object.assign(new Negocio(), {
        id: 20,
        activadoEn: new Date('2026-09-10T12:00:00Z'),
      }),
    });
    findById.mockImplementation(async () => usuario);
    const module = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        {
          provide: ConfigService,
          useValue: new ConfigService({ JWT_SECRET: 'solo-para-pruebas' }),
        },
        { provide: UsuariosService, useValue: { findById } },
      ],
    }).compile();
    strategy = module.get(JwtStrategy);
  });

  it('usa los datos actuales y no expone el hash ni la entidad negocio', async () => {
    await expect(strategy.validate(payload)).resolves.toEqual({
      sub: 1,
      email: usuario.email,
      nombre: usuario.nombre,
      rol: Rol.RECEPCIONISTA,
      negocioId: 20,
    });
    expect(findById).toHaveBeenCalledWith(1);
  });

  it('conserva el identificador de sesión persistida recibido en el JWT', async () => {
    await expect(strategy.validate({
      ...payload,
      sesionId: '5e85643d-04a7-4b5e-8ed4-6a8029a2b673',
    })).resolves.toMatchObject({
      sesionId: '5e85643d-04a7-4b5e-8ed4-6a8029a2b673',
    });
  });

  it('rechaza un usuario eliminado', async () => {
    findById.mockResolvedValue(null);
    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rechaza la siguiente petición cuando se desactiva el usuario', async () => {
    await strategy.validate(payload);
    usuario.activo = false;
    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rechaza la siguiente petición cuando el negocio queda pendiente', async () => {
    await strategy.validate(payload);
    usuario.negocio!.activadoEn = null;
    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rechaza un usuario de negocio sin negocio asociado', async () => {
    usuario.negocio = null;
    usuario.negocioId = null;
    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('permite al superadmin activo sin negocio', async () => {
    usuario.rol = Rol.SUPERADMIN;
    usuario.negocio = null;
    usuario.negocioId = null;
    await expect(strategy.validate(payload)).resolves.toMatchObject({
      rol: Rol.SUPERADMIN,
      negocioId: null,
    });
  });

  it('rechaza un superadmin desactivado', async () => {
    usuario.rol = Rol.SUPERADMIN;
    usuario.activo = false;
    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it.each([0, -1, 1.5, NaN])(
    'rechaza un identificador inválido: %s',
    async (sub) => {
      await expect(
        strategy.validate({ ...payload, sub }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(findById).not.toHaveBeenCalled();
    },
  );
});
