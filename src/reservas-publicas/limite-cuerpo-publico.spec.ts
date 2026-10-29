import {
  Body,
  Controller,
  type INestApplication,
  Module,
  Post,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import express from 'express';
import request from 'supertest';
import { instalarLimiteCuerpoPublico } from './limite-cuerpo-publico';

@Controller()
class ControladorCuerposPrueba {
  @Post('auth/login')
  login(@Body() body: Record<string, unknown>) {
    return body;
  }

  @Post('publico/negocios/demo/eco')
  publico(@Body() body: Record<string, unknown>) {
    return body;
  }
}

@Module({ controllers: [ControladorCuerposPrueba] })
class ModuloCuerposPrueba {}

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
    expect(respuesta.headers['cache-control']).toBe('no-store');
  });

  it('conserva el parser JSON global de Nest para las rutas no públicas', async () => {
    const modulo = await Test.createTestingModule({
      imports: [ModuloCuerposPrueba],
    }).compile();
    const aplicacion = modulo.createNestApplication();
    instalarLimiteCuerpoPublico(aplicacion);

    try {
      await aplicacion.init();
      const servidor = aplicacion.getHttpServer();
      await request(servidor).post('/auth/login')
        .send({ email: 'admin@example.test', password: 'secreto' })
        .expect(201)
        .expect({ email: 'admin@example.test', password: 'secreto' });
      await request(servidor).post('/publico/negocios/demo/eco')
        .send({ dato: 'publico' })
        .expect(201)
        .expect({ dato: 'publico' });
    } finally {
      await aplicacion.close();
    }
  });
});
