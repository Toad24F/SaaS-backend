import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UsuariosService } from '../usuarios/usuarios.service';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Rol } from './enums/rol.enum';
import { PoliticaContrasenasService } from './services/politica-contrasenas.service';
import { SesionesService } from './services/sesiones.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Licencia } from '../licencias/entities/licencia.entity';
import { PoliticaAccesoLicenciaService } from '../licencias/services/politica-acceso-licencia.service';
import { RELOJ } from '../comun/reloj';

describe('AuthService', () => {
  let service: AuthService;
  const findByEmailWithNegocio = jest.fn();
  const sign = jest.fn();
  const crearSesion = jest.fn();
  const findOneBy = jest.fn();

  beforeEach(async () => {
    findByEmailWithNegocio.mockReset();
    sign.mockReset().mockReturnValue('token-de-prueba');
    crearSesion.mockReset().mockResolvedValue({ id: 'sesion-prueba' });
    findOneBy.mockReset().mockResolvedValue({
      habilitadaEn: new Date('2026-09-10T12:00:00Z'),
      venceEn: new Date('2027-09-10T12:00:00Z'),
      suspendidaEn: null,
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsuariosService, useValue: { findByEmailWithNegocio } },
        { provide: JwtService, useValue: { sign } },
        PoliticaContrasenasService,
        PoliticaAccesoLicenciaService,
        { provide: SesionesService, useValue: { crear: crearSesion, revocar: jest.fn() } },
        { provide: getRepositoryToken(Licencia), useValue: { findOneBy } },
        { provide: RELOJ, useValue: { ahora: () => new Date('2026-09-11T12:00:00Z') } },
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
      activadoEn: new Date('2026-09-10T12:00:00Z'),
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
    findByEmailWithNegocio.mockResolvedValue({
      activo: true,
      activadoEn: new Date('2026-09-10T12:00:00Z'),
      nombre: 'Usuario',
      rol: Rol.SUPERADMIN,
      passwordHash: await bcrypt.hash('correcta', 4),
    });
    await expect(service.login({ email: 'admin@example.com', password: 'incorrecta' }))
      .rejects.toBeInstanceOf(UnauthorizedException);
    expect(sign).not.toHaveBeenCalled();
  });

  it('rechaza una cuenta pendiente aunque todavía figure activa', async () => {
    findByEmailWithNegocio.mockResolvedValue({
      activo: true,
      activadoEn: null,
      nombre: null,
      passwordHash: null,
    });

    await expect(service.login({
      email: 'pendiente@example.com',
      password: 'sin-credencial',
    })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(sign).not.toHaveBeenCalled();
  });

  it('rechaza el acceso de un usuario cuyo negocio sigue pendiente', async () => {
    findByEmailWithNegocio.mockResolvedValue({
      id: 2,
      email: 'admin-negocio@example.com',
      nombre: 'Admin negocio',
      activo: true,
      activadoEn: new Date('2026-09-10T12:00:00Z'),
      rol: Rol.ADMIN_NEGOCIO,
      negocioId: 10,
      negocio: { activadoEn: null },
      passwordHash: await bcrypt.hash('contraseña-de-prueba', 4),
    });

    await expect(service.login({
      email: 'admin-negocio@example.com',
      password: 'contraseña-de-prueba',
    })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(sign).not.toHaveBeenCalled();
  });
});
