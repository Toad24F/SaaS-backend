import { randomUUID } from 'node:crypto';
import { PassThrough } from 'node:stream';
import sharp from 'sharp';
import request from 'supertest';
import { Rol } from '../src/auth/enums/rol.enum';
import { Negocio } from '../src/negocios/entities/negocio.entity';
import { EjecucionPeriodicaService } from '../src/operacion/ejecucion-periodica.service';
import { COLORES_PREDETERMINADOS_PORTAL } from '../src/personalizacion-portal/colores-portal';
import { PersonalizacionPortal } from '../src/personalizacion-portal/entities/personalizacion-portal.entity';
import { RecursoPortal } from '../src/personalizacion-portal/entities/recurso-portal.entity';
import { conAgendaHttp } from './support/agenda-http';
import { situarSesion } from './support/acceso-operativo';

const PRIVADA = '/negocio/personalizacion';
const COLORES = { ...COLORES_PREDETERMINADOS_PORTAL, acento: '#686868' };
type Escenario = Parameters<Parameters<typeof conAgendaHttp>[0]>[0];

function auth(f: Escenario, indice = 0, rol = Rol.ADMIN_NEGOCIO) {
  return `Bearer ${f.token(f.actor(rol, indice).id)}`;
}

async function cargar(f: Escenario, version: number, indice = 0): Promise<string> {
  const png = await sharp({ create: { width: 8, height: 6, channels: 4, background: '#33669980' } }).png().toBuffer();
  const respuesta = await request(f.http).post(`${PRIVADA}/logos`).set('Authorization', auth(f, indice))
    .field('version', String(version)).attach('archivo', png, { filename: 'logo.png', contentType: 'image/png' })
    .expect(201);
  expect(typeof respuesta.body.expiraEn).toBe('string');
  return respuesta.body.id;
}

function publicar(f: Escenario, version: number, logoId: string | null, indice = 0, acento = COLORES.acento) {
  return request(f.http).put(PRIVADA).set('Authorization', auth(f, indice)).send({ version, logoId, acento });
}

async function rutaPublica(f: Escenario, indice = 0) {
  const negocio = await f.db.getRepository(Negocio).findOneByOrFail({ id: f.negocios[indice].id });
  return `/publico/negocios/${encodeURIComponent(negocio.slug)}`;
}

describe('M5-T048–T050 · Marca publicada del portal', () => {
  it('publica logo y colores con versión, conserva la configuración ante rechazos y valida al administrador', async () => {
    await conAgendaHttp(async (f) => {
      await request(f.http).get(PRIVADA).expect(401);
      await request(f.http).put(PRIVADA).set('Authorization', auth(f, 0, Rol.RECEPCIONISTA)).send({}).expect(403);
      await request(f.http).get(PRIVADA).set('Authorization', auth(f)).expect(200, {
        version: 0, acento: COLORES_PREDETERMINADOS_PORTAL.acento, logoId: null,
        acentoPredeterminado: COLORES_PREDETERMINADOS_PORTAL.acento,
      });
      const logo = await cargar(f, 0);
      const ajeno = await cargar(f, 0, 1);
      const subir = () => request(f.http).post(`${PRIVADA}/logos`).set('Authorization', auth(f));
      await subir().field('version', '0').attach('archivo', Buffer.alloc(2 * 1024 * 1024 + 1), 'grande.png').expect(400);
      await subir().field('version', '00').attach('archivo', Buffer.from('falso'), 'falso.png').expect(400);
      const publicado = { version: 1, acento: COLORES.acento, logoId: logo };
      await publicar(f, 0, logo).expect(200, publicado);
      await publicar(f, 0, null).expect(409);
      await publicar(f, 1, ajeno).expect(404);
      await publicar(f, 1, randomUUID()).expect(404);
      await publicar(f, 1, null, 0, '#ffffff80').expect(400);
      await request(f.http).put(PRIVADA).set('Authorization', auth(f))
        .send({ version: 1, acento: COLORES.acento, logoId: logo, negocioId: f.negocios[1].id }).expect(400);
      await request(f.http).get(PRIVADA).set('Authorization', auth(f)).expect(200, {
        ...publicado, acentoPredeterminado: COLORES_PREDETERMINADOS_PORTAL.acento,
      });
    });
  });

  it('publica solo el acento, rechaza fondo y texto y conserva las columnas históricas', async () => {
    await conAgendaHttp(async (f) => {
      const marca = f.db.getRepository(PersonalizacionPortal);
      const negocioId = f.negocios[0].id;
      const historica = { ...COLORES, fondo: '#fff8ed', texto: '#000000' };
      await marca.insert({ negocioId, version: 1, ...historica, logoId: null });
      const ruta = await rutaPublica(f);

      // El catálogo proyecta el acento antiguo, sin imponer su fondo histórico a ningún tema.
      const antes = await request(f.http).get(`${ruta}/catalogo`).expect(200);
      expect(antes.body.marca).toEqual({ acento: historica.acento });
      for (const campo of [{ fondo: '#ffffff' }, { texto: '#000000' }, { colores: historica }]) {
        await request(f.http).put(PRIVADA).set('Authorization', auth(f))
          .send({ version: 1, logoId: null, acento: '#b3442c', ...campo }).expect(400);
      }
      expect(await marca.findOneByOrFail({ negocioId })).toMatchObject({ version: 1, ...historica });

      await publicar(f, 1, null, 0, '#F0F0F0').expect(200, {
        version: 2, acento: '#f0f0f0', logoId: null,
      });
      expect(await marca.findOneByOrFail({ negocioId })).toMatchObject({ ...historica, version: 2, acento: '#f0f0f0' });
      const despues = await request(f.http).get(`${ruta}/catalogo`).expect(200);
      expect(despues.body.marca).toEqual({ acento: '#f0f0f0' });
    });
  });

  it('publica una sola pareja de logo y colores cuando dos solicitudes observan la misma versión', async () => {
    await conAgendaHttp(async (f) => {
      const uno = await cargar(f, 0);
      const dos = await cargar(f, 0);
      const coloresDos = { ...COLORES, acento: '#717171' };
      const respuestas = await Promise.all([publicar(f, 0, uno), publicar(f, 0, dos, 0, coloresDos.acento)]);
      expect(respuestas.map((r) => r.status).sort()).toEqual([200, 409]);
      const ganador = respuestas[0].status === 200 ? { logoId: uno, ...COLORES } : { logoId: dos, ...coloresDos };
      expect(await f.db.getRepository(PersonalizacionPortal).findOneByOrFail({ negocioId: f.negocios[0].id }))
        .toMatchObject({ version: 1, ...ganador });
    });
  });

  it('conserva la versión y ambos valores ante un fallo de escritura en MariaDB', async () => {
    await conAgendaHttp(async (f) => {
      const anterior = await cargar(f, 0);
      await publicar(f, 0, anterior).expect(200);
      const nuevo = await cargar(f, 1);
      // La auditoría falla después de escribir la marca. El rollback debe revertir ambos efectos.
      await f.db.query(`CREATE TRIGGER fallo_publicacion_test BEFORE INSERT ON eventos_auditoria
        FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Fallo de prueba'`);
      const respuesta = await publicar(f, 1, nuevo, 0, '#717171').expect(500);
      expect(JSON.stringify(respuesta.body)).not.toContain('Fallo de prueba');
      expect(await f.db.getRepository(PersonalizacionPortal).findOneByOrFail({ negocioId: f.negocios[0].id }))
        .toMatchObject({ version: 1, logoId: anterior, ...COLORES });
      expect(await f.db.getRepository(RecursoPortal).countBy({ negocioId: f.negocios[0].id })).toBe(2);
      const [auditoria] = await f.db.query("SELECT COUNT(*) total FROM eventos_auditoria WHERE accion='personalizacion_portal_publicada'");
      expect(Number(auditoria.total)).toBe(1);
    });
  });

  it('restaura solo el negocio autenticado y limpia al vencer sin borrar logos publicados', async () => {
    await conAgendaHttp(async (f) => {
      const logoA = await cargar(f, 0);
      const provisional = await cargar(f, 0);
      const logoB = await cargar(f, 0, 1);
      await publicar(f, 0, logoA).expect(200);
      await publicar(f, 0, logoB, 1).expect(200);
      const restaurar = (version: number) => request(f.http).post(`${PRIVADA}/restaurar`)
        .set('Authorization', auth(f)).send({ version });
      await restaurar(0).expect(409);
      await restaurar(1).expect(200, { version: 2, acento: COLORES_PREDETERMINADOS_PORTAL.acento, logoId: null });
      const ciclo = f.app.get(EjecucionPeriodicaService);
      f.reloj.avanzar(24 * 60 * 60 * 1000 - 1);
      // Mantiene sesiones válidas al simular el día transcurrido para los logos.
      for (const indice of [0, 1]) await situarSesion(f.db, f.actor(Rol.ADMIN_NEGOCIO, indice), f.reloj.ahora());
      const vigente = await cargar(f, 2);
      await ciclo.ciclo();
      const recursos = f.db.getRepository(RecursoPortal);
      expect(await recursos.count()).toBe(4);
      f.reloj.avanzar(1);
      await publicar(f, 2, provisional).expect(404);
      await ciclo.ciclo();
      await ciclo.ciclo();
      expect((await recursos.find()).map((r) => r.id).sort()).toEqual([logoB, vigente].sort());
      await request(f.http).get(PRIVADA).set('Authorization', auth(f, 1)).expect(200, {
        version: 1, acento: COLORES.acento, logoId: logoB, acentoPredeterminado: COLORES_PREDETERMINADOS_PORTAL.acento,
      });
      await publicar(f, 1, logoB, 1).expect(200); // El logo vigente se puede conservar tras su fecha provisional.
    });
  });

  it('proyecta el logo vigente por slug y devuelve 404 ante provisional, ajeno, sustituido o licencia cerrada', async () => {
    await conAgendaHttp(async (f) => {
      const rutaA = await rutaPublica(f);
      const rutaB = await rutaPublica(f, 1);
      const logoA = await cargar(f, 0);
      const sustituto = await cargar(f, 0);
      const logoB = await cargar(f, 0, 1);
      const antes = await request(f.http).get(`${rutaA}/catalogo`).expect(200);
      expect(antes.body.marca).toEqual({ acento: COLORES_PREDETERMINADOS_PORTAL.acento });
      await request(f.http).get(`${rutaA}/logos/${logoA}`).expect(404);
      await publicar(f, 0, logoA).expect(200);
      await publicar(f, 0, logoB, 1).expect(200);
      const url = `${rutaA}/logos/${logoA}`;
      const catalogo = await request(f.http).get(`${rutaA}/catalogo`).expect(200);
      expect(catalogo.body.marca).toEqual({ acento: COLORES.acento, logoUrl: url });
      // Consumir el archivo como bytes comprueba el tipo y la codificación reales.
      const raster = await request(f.http).get(url).buffer(true).parse((res, done) => {
        const partes: Buffer[] = [];
        const flujo = res.pipe(new PassThrough());
        flujo.on('data', (parte: Buffer) => partes.push(parte));
        flujo.on('end', () => done(null, Buffer.concat(partes)));
        flujo.on('error', done);
      }).expect(200).expect('Content-Type', 'image/webp').expect('Cache-Control', 'no-store')
        .expect('X-Content-Type-Options', 'nosniff');
      expect(await sharp(raster.body).metadata()).toMatchObject({ format: 'webp', width: 8, height: 6 });
      await request(f.http).get(`${rutaB}/logos/${logoA}`).expect(404);
      await publicar(f, 1, sustituto).expect(200);
      await request(f.http).get(url).expect(404);
      await f.db.query('UPDATE licencias SET vence_en=? WHERE negocio_id=?', [f.reloj.ahora(), f.negocios[0].id]);
      await request(f.http).get(`${rutaA}/logos/${sustituto}`).expect(404);
      await request(f.http).get(`${rutaA}/catalogo`).expect(404);
    });
  });
});
