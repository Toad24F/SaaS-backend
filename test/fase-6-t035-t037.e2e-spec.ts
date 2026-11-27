import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ProcesadorCorreoService } from '../src/correos/procesador-correo.service';
import { TransporteCorreoControlado } from '../src/correos/transporte-correo-controlado';
import { RELOJ } from '../src/comun/reloj';
import { conBaseMigrada } from './support/mariadb';
import { RelojPrueba } from './support/reloj';
import { crearActivo, crearSuperadmin, fechaSegura, PASSWORD_T51_T60 } from './support/escenarios-t51-t60';

describe('M5-T035–T037: historial paginado de correos', () => {
  it('filtra y pagina con totales del conjunto completo, sin cruzar negocios', async () => {
    await conBaseMigrada(async db => {
      const reloj = new RelojPrueba(fechaSegura());
      const procesador = new ProcesadorCorreoService(db, new TransporteCorreoControlado(), undefined, reloj);
      const modulo = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(DataSource).useValue(db).overrideProvider(RELOJ).useValue(reloj)
        .overrideProvider(ProcesadorCorreoService).useValue(procesador).compile();
      const app = modulo.createNestApplication();
      app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
      try {
        await app.init();
        const actor = await crearSuperadmin(db, reloj.ahora());
        const negocio = await crearActivo(db, actor.id, reloj.ahora());
        const ajeno = await crearActivo(db, actor.id, reloj.ahora());
        const token = (await request(app.getHttpServer()).post('/auth/login')
          .send({ email: actor.email, password: PASSWORD_T51_T60 }).expect(200)).body.accessToken as string;
        const ruta = `/negocios/${negocio.negocioId}/envios`;
        const consultar = (sufijo = '') => request(app.getHttpServer()).get(`${ruta}${sufijo}`)
          .auth(token, { type: 'bearer' });

        // Las fechas y estados se siembran en una base test; cada fila respeta referencias y checks SQL.
        const sembrar = async (negocioId: number, licenciaId: number, indice: number,
          estado: string, fecha: string, tipo = 'aviso_vencimiento') => {
          const confirmada = estado === 'enviado' ? fecha : null;
          await db.query(`INSERT INTO envios_correo (negocio_id,tipo,correo_destinatario,clave_dedupe,
            licencia_id,version_vencimiento,umbral_dias,estado,intentos,proximo_intento_en,
            confirmado_en,creado_en,actualizado_en) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [negocioId, tipo, 'destino@example.test', `m5-historial-${negocioId}-${indice}`,
            licenciaId, 1, tipo === 'aviso_preventivo' ? 7 : null, estado, 0, fecha,
            confirmada, fecha, fecha]);
        };
        await sembrar(negocio.negocioId, negocio.licencia.id, 1, 'pendiente', '2026-11-09 10:00:00');
        await sembrar(negocio.negocioId, negocio.licencia.id, 2, 'fallido', '2026-11-10 10:00:00');
        await sembrar(negocio.negocioId, negocio.licencia.id, 3, 'fallido', '2026-11-11 23:59:59.999999');
        await sembrar(negocio.negocioId, negocio.licencia.id, 4, 'enviado', '2026-11-12 10:00:00');
        await sembrar(negocio.negocioId, negocio.licencia.id, 5, 'descartado', '2026-11-13 10:00:00', 'aviso_preventivo');
        await sembrar(ajeno.negocioId, ajeno.licencia.id, 6, 'fallido', '2026-11-11 10:00:00');

        const primera = await consultar('?pagina=1&limite=2').expect(200);
        expect(primera.body).toMatchObject({ pagina: 1, limite: 2, total: 5,
          contadores: { pendiente: 1, tomado: 0, enviado: 1, fallido: 2, descartado: 1 } });
        expect(primera.body.envios).toHaveLength(2);
        expect(primera.body.envios.map((fila: { id: string }) => fila.id)).toEqual(['5', '4']);
        const segunda = await consultar('?pagina=2&limite=2').expect(200);
        expect(segunda.body).toMatchObject({ pagina: 2, limite: 2, total: 5,
          contadores: primera.body.contadores });
        expect(segunda.body.envios).toHaveLength(2);
        expect(new Set([...primera.body.envios, ...segunda.body.envios].map((fila: { id: string }) => fila.id)).size).toBe(4);
        const vacia = await consultar('?pagina=9&limite=2').expect(200);
        expect(vacia.body).toMatchObject({ envios: [], total: 5, contadores: primera.body.contadores });

        const filtrada = await consultar('?estado=fallido&tipo=aviso_vencimiento&desde=2026-11-10&hasta=2026-11-11&limite=1').expect(200);
        expect(filtrada.body).toMatchObject({ total: 2,
          contadores: { pendiente: 0, tomado: 0, enviado: 0, fallido: 2, descartado: 0 } });
        expect(filtrada.body.envios).toHaveLength(1);
        expect((await consultar('?estado=fallido&tipo=aviso_vencimiento&desde=2026-11-10&hasta=2026-11-11&limite=1&pagina=2').expect(200)).body.envios).toHaveLength(1);
        expect((await consultar('?estado=fallido&tipo=aviso_vencimiento&desde=2026-11-10&hasta=2026-11-11&limite=1&pagina=3').expect(200)).body)
          .toMatchObject({ envios: [], total: 2, contadores: filtrada.body.contadores });
        expect((await consultar('?tipo=aviso_preventivo').expect(200)).body).toMatchObject({ total: 1,
          contadores: { descartado: 1 } });
        expect((await consultar('?estado=tomado').expect(200)).body).toMatchObject({ envios: [], total: 0,
          contadores: { pendiente: 0, tomado: 0, enviado: 0, fallido: 0, descartado: 0 } });
        expect((await request(app.getHttpServer()).get(`/negocios/${ajeno.negocioId}/envios`)
          .auth(token, { type: 'bearer' }).expect(200)).body.total).toBe(1);

        for (const filtro of ['pagina=0', 'pagina=1.5', 'limite=0', 'limite=101', 'limite=abc',
          'estado=inventado', 'tipo=otro', 'desde=2026-02-30', 'hasta=2026-11-31',
          'desde=2026-11-12&hasta=2026-11-11', 'desconocido=1']) {
          await consultar(`?${filtro}`).expect(400);
        }
      } finally { await app.close(); }
    });
  });
});
