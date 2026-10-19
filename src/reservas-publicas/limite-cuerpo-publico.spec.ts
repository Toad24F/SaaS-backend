import type { INestApplication } from '@nestjs/common';
import express from 'express';
import request from 'supertest';
import { instalarLimiteCuerpoPublico } from './limite-cuerpo-publico';

describe('M3-T069: límite del JSON crudo del portal', () => {
  // Este servidor mínimo ejerce el parser sin activar todavía la ruta de reserva.
  const app = express();
  instalarLimiteCuerpoPublico(app as unknown as INestApplication);
  app.post('/publico/negocios/demo/intentos/1/reservar', (req, res) =>
    res.json({ recibido: req.body }));

  it('acepta 32 KiB exactos', async () => {
    const base = JSON.stringify({ dato: '' });
    const cuerpo = JSON.stringify({ dato: 'x'.repeat(32 * 1024 - base.length) });
    expect(Buffer.byteLength(cuerpo)).toBe(32 * 1024);
    await request(app).post('/publico/negocios/demo/intentos/1/reservar')
      .set('Content-Type', 'application/json').send(cuerpo).expect(200);
  });

  it('rechaza exceso por espacios aunque el objeto sea pequeño', async () => {
    const cuerpo = JSON.stringify({ dato: 'x' }) + ' '.repeat(32 * 1024);
    const respuesta = await request(app).post('/publico/negocios/demo/intentos/1/reservar')
      .set('Content-Type', 'application/json').send(cuerpo).expect(400);
    expect(respuesta.body).toEqual({ codigo: 'portal_400',
      mensaje: 'Reduzca el formulario.', accion: 'corregir' });
  });
});
