import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import { RelojSistema, RELOJ } from '../comun/reloj';
import { Licencia } from '../licencias/entities/licencia.entity';
import { PoliticaAccesoLicenciaService } from '../licencias/services/politica-acceso-licencia.service';
import { UsuariosService } from '../usuarios/usuarios.service';
import { AuthService } from './auth.service';
import { Rol } from './enums/rol.enum';
import { PoliticaContrasenasService } from './services/politica-contrasenas.service';
import { SesionesService } from './services/sesiones.service';

describe('Flujos de sesión T35 y T37', () => {
  const findByEmailWithNegocio = jest.fn();
  const findOneBy = jest.fn();
  const crear = jest.fn();
  const revocar = jest.fn();
  const sign = jest.fn().mockReturnValue('jwt-con-sesion');
  const ahora = new Date('2026-09-12T20:00:00.000Z');
  let servicio: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();
    crear.mockResolvedValue({ id: 'sesion-1', expiraEn: new Date(ahora.getTime() + 3600000) });
    const modulo = await Test.createTestingModule({ providers: [
      AuthService,
      { provide: UsuariosService, useValue: { findByEmailWithNegocio } },
      { provide: JwtService, useValue: { sign } },
      { provide: SesionesService, useValue: { crear, revocar } },
      { provide: getRepositoryToken(Licencia), useValue: { findOneBy } },
      { provide: RELOJ, useValue: { ahora: () => new Date(ahora) } as RelojSistema },
      PoliticaContrasenasService,
      PoliticaAccesoLicenciaService,
    ] }).compile();
    servicio = modulo.get(AuthService);
  });

  it('crea sesión persistida e incluye sesionId en el token', async () => {
    const politica = new PoliticaContrasenasService();
    findByEmailWithNegocio.mockResolvedValue({
      id: 1, email: 'root@example.test', nombre: 'Root', activo: true,
      activadoEn: ahora, passwordHash: await politica.generarHash('contraseña-segura'),
      rol: Rol.SUPERADMIN, negocioId: null, negocio: null,
    });
    await expect(servicio.login({ email: 'root@example.test', password: 'contraseña-segura' }))
      .resolves.toMatchObject({ accessToken: 'jwt-con-sesion' });
    expect(crear).toHaveBeenCalledWith(1, ahora);
    expect(sign).toHaveBeenCalledWith(expect.objectContaining({ sesionId: 'sesion-1' }));
  });

  it('rechaza con 401 una licencia bloqueada sin crear sesión', async () => {
    const politica = new PoliticaContrasenasService();
    findByEmailWithNegocio.mockResolvedValue({
      id: 2, email: 'admin@example.test', nombre: 'Admin', activo: true,
      activadoEn: ahora, passwordHash: await politica.generarHash('contraseña-segura'),
      rol: Rol.ADMIN_NEGOCIO, negocioId: 5, negocio: { activadoEn: ahora },
    });
    findOneBy.mockResolvedValue({ habilitadaEn: ahora, venceEn: new Date(ahora.getTime() + 1000), suspendidaEn: ahora });
    await expect(servicio.login({ email: 'admin@example.test', password: 'contraseña-segura' }))
      .rejects.toBeInstanceOf(UnauthorizedException);
    expect(crear).not.toHaveBeenCalled();
  });

  it('revoca logout por sesión reconocida sin consultar licencia', async () => {
    await servicio.logout({ sub: 2, sesionId: 'sesion-1' }, ahora);
    expect(revocar).toHaveBeenCalledWith('sesion-1', 2, ahora);
    expect(findOneBy).not.toHaveBeenCalled();
  });
});
