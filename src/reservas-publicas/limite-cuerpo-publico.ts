import type { INestApplication } from '@nestjs/common';
import { json, type ErrorRequestHandler } from 'express';

/** El parser del portal ve el JSON crudo antes que el parser general de Nest. */
export function instalarLimiteCuerpoPublico(app: INestApplication): void {
  app.use('/publico/negocios', json({ limit: 32 * 1024 }));
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
