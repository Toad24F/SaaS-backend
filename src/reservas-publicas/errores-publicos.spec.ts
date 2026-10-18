import { BadRequestException, ConflictException, ForbiddenException,
  NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { normalizarErrorPublico } from './errores-publicos';

describe('M3-T041: errores públicos seguros', () => {
  it.each([
    [new BadRequestException('SQL secreto'), 400, 'corregir'],
    [new UnauthorizedException('cookie privada'), 401, 'reiniciar'],
    [new ForbiddenException('csrf privado'), 403, 'corregir'],
    [new NotFoundException('tenant privado'), 404, 'volver'],
    [new ConflictException('hash privado'), 409, 'volver'],
    [new ServiceUnavailableException('traza privada'), 503, 'reintentar'],
  ])('traduce el estado %i sin filtrar la causa', (origen, estado, accion) => {
    const error = normalizarErrorPublico(origen);
    expect(error.getStatus()).toBe(estado);
    expect(error.getResponse()).toMatchObject({ codigo: `portal_${estado}`,
      mensaje: expect.any(String), accion });
    expect(JSON.stringify(error.getResponse())).not.toMatch(/secreto|privad|SQL|traza/i);
  });

  it('separa fallos temporales de inesperados, sin devolver una agenda vacía', () => {
    const temporal = normalizarErrorPublico({ code: 'ER_LOCK_WAIT_TIMEOUT',
      sql: 'SELECT titular_hash FROM bloqueos_temporales' });
    expect(temporal.getStatus()).toBe(503);
    expect(temporal.getResponse()).toMatchObject({ accion: 'reintentar' });
    const inesperado = normalizarErrorPublico(new Error('SELECT correo FROM clientes'));
    expect(inesperado.getStatus()).toBe(500);
    expect(JSON.stringify(inesperado.getResponse())).not.toMatch(/SELECT|clientes/i);
  });
});
