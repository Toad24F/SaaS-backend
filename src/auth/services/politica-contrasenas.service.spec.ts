import { BadRequestException } from '@nestjs/common';
import { PoliticaContrasenasService } from './politica-contrasenas.service';

describe('Política de contraseñas (T20)', () => {
  const servicio = new PoliticaContrasenasService();

  it('genera un hash y compara sin conservar el texto', async () => {
    const hash = await servicio.generarHash('contraseña-segura-2026');
    expect(hash).not.toContain('contraseña-segura-2026');
    await expect(servicio.comparar('contraseña-segura-2026', hash)).resolves.toBe(true);
    await expect(servicio.comparar('otra-contraseña', hash)).resolves.toBe(false);
  });

  it('rechaza menos de 12 caracteres', async () => {
    await expect(servicio.generarHash('corta-12345')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rechaza entradas que bcrypt truncaría después de 72 bytes', async () => {
    await expect(servicio.generarHash('á'.repeat(37))).rejects.toThrow(
      '72 bytes',
    );
  });
});
