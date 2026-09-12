import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LimiteIntentosGuard } from './guards/limite-intentos.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

describe('AuthController', () => {
  let controller: AuthController;
  const login = jest.fn();

  beforeEach(async () => {
    login.mockReset();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: { login } }],
    })
      // Esta suite prueba el controlador; las protecciones HTTP se prueban por separado.
      .overrideGuard(LimiteIntentosGuard).useValue({ canActivate: () => true })
      .overrideGuard(JwtAuthGuard).useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('delega las credenciales y devuelve el resultado del servicio', async () => {
    const entrada = { email: 'admin@example.com', password: 'contraseña-de-prueba' };
    login.mockResolvedValue({ accessToken: 'token-de-prueba' });
    await expect(controller.login(entrada)).resolves.toEqual({ accessToken: 'token-de-prueba' });
    expect(login).toHaveBeenCalledWith(entrada);
  });
});
