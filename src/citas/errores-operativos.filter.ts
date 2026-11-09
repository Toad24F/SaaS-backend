import { ArgumentsHost, Catch, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { normalizarErrorOperativo } from './errores-operativos';

/** Frontera optativa de las futuras rutas operativas; no modifica filtros globales ni públicos. */
@Catch()
export class ErroresOperativosFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost): void {
    const seguro = normalizarErrorOperativo(error);
    const respuesta = host.switchToHttp().getResponse<Response>();
    respuesta.setHeader('Cache-Control', 'no-store');
    respuesta.status(seguro.getStatus()).json(seguro.getResponse());
  }
}
