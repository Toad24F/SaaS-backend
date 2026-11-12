import { HttpException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { normalizarErrorOperativo } from '../src/citas/errores-operativos';
import { CupoTelefonicoExcedidoException, MENSAJE_CUPO_TELEFONICO } from '../src/reservas-publicas/cupo-telefonico.service';

const SECRETO = 'SQL SELECT cliente teléfono 6149999999 stack password token';

describe('M4-T024: errores operativos seguros', () => {
  it.each([400, 401, 403, 404, 409, 500, 503])('normaliza HTTP %s sin conservar contenido privado', (estado) => {
    const error = normalizarErrorOperativo(new HttpException({ message: SECRETO, extra: SECRETO }, estado));
    expect(error.getStatus()).toBe(estado);
    expect(JSON.stringify(error.getResponse())).not.toContain(SECRETO);
    expect(error.message).not.toContain('6149999999');
  });

  it.each(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'PROTOCOL_CONNECTION_LOST',
    'ER_LOCK_WAIT_TIMEOUT', 'ER_LOCK_DEADLOCK', 'ER_CON_COUNT_ERROR'])('clasifica %s como temporal', (code) => {
    const error = normalizarErrorOperativo(new QueryFailedError(SECRETO, [SECRETO], Object.assign(new Error(SECRETO), { code })));
    expect(error.getStatus()).toBe(503);
    expect(JSON.stringify(error.getResponse())).not.toContain(SECRETO);
  });

  it('distingue los siete resultados y no convierte fallos en vacío ni ausencia terminal', () => {
    const errores = [400, 401, 403, 404, 409, 500, 503].map((s) => normalizarErrorOperativo(new HttpException(SECRETO, s)));
    expect(new Set(errores.map((e) => e.message)).size).toBe(7);
    for (const error of [new Error(SECRETO), new QueryFailedError(SECRETO, [], new Error(SECRETO)), null]) {
      expect(normalizarErrorOperativo(error).getStatus()).toBe(500);
    }
    expect(normalizarErrorOperativo(new HttpException(SECRETO, 418)).getStatus()).toBe(500);
    // Un objeto de error externo puede incumplir el tipo estático de Nest.
    for (const estado of ['500', '__proto__', 'constructor', NaN, undefined]) {
      expect(normalizarErrorOperativo(new HttpException(SECRETO, estado as never)).getStatus()).toBe(500);
    }
    expect(JSON.stringify(normalizarErrorOperativo(new Error(SECRETO)).getResponse())).not.toContain('no_registrado');
  });

  it('conserva el mensaje contractual de cupo únicamente para la excepción de dominio conocida', () => {
    const seguro = normalizarErrorOperativo(new CupoTelefonicoExcedidoException());
    expect(seguro.message).toBe(MENSAJE_CUPO_TELEFONICO);
    expect(normalizarErrorOperativo(seguro)).toBe(seguro);
    expect(normalizarErrorOperativo(new HttpException(SECRETO, 409)).message).not.toBe(SECRETO);
  });
});
