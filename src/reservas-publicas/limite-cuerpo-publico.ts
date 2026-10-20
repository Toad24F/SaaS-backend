import type { INestApplication } from '@nestjs/common';
import { json, type ErrorRequestHandler, type RequestHandler } from 'express';

/** El parser del portal ve el JSON crudo antes que el parser general de Nest. */
export function instalarLimiteCuerpoPublico(app: INestApplication): void {
  const analizarJsonPublico = json({ limit: 32 * 1024 });
  // Nest detecta sus parsers globales por el nombre interno `jsonParser`.
  // La envoltura evita que confunda este parser acotado con el parser global.
  const limitarJsonPublico: RequestHandler = (req, res, next) =>
    analizarJsonPublico(req, res, next);
  app.use('/publico/negocios', limitarJsonPublico);
  const manejarExceso: ErrorRequestHandler = (error, _req, res, next) => {
    if (error && typeof error === 'object' && 'type' in error &&
      error.type === 'entity.too.large') {
      res.status(400).json({ codigo: 'portal_400', mensaje: 'Reduzca el formulario.',
        accion: 'corregir' });
      return;
    }
    next(error);
  };
  app.use('/publico/negocios', manejarExceso);
}
