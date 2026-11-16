import request from 'supertest';
import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { Rol } from '../src/auth/enums/rol.enum';
import { conAgendaHttp } from './support/agenda-http';
import { prepararManual, filasManuales, RUTA_MANUAL } from './support/cita-manual';

/** Delega SQL real y falla después: prueba el rollback del commit completo, no un doble del escritor. */
function fallarSql(db: DataSource, coincide: (sql: string) => boolean, temporal: boolean) {
  const crear = db.createQueryRunner.bind(db); const trazas: jest.SpyInstance[] = []; let aplicado = false;
  const espia = jest.spyOn(db, 'createQueryRunner').mockImplementation((...args) => {
    const runner = crear(...args); const ejecutar = runner.query.bind(runner);
    trazas.push(jest.spyOn(runner, 'query').mockImplementation(async (...consulta) => {
      const resultado = await ejecutar(...consulta);
      if (!aplicado && coincide(consulta[0])) {
        aplicado = true;
        throw Object.assign(new Error('SELECT SQL stack contacto-ajeno 6149999999'), temporal ? { code: 'ER_LOCK_WAIT_TIMEOUT' } : {});
      }
      return resultado;
    })); return runner;
  });
  return { aplicado: () => aplicado, restaurar: () => { espia.mockRestore(); for (const t of trazas) t.mockRestore(); } };
}

/** Revisa todas las respuestas personales, incluidos errores, sin SQL, trazas o contacto ajeno. */
function segura(r: request.Response) {
  expect(r.headers['cache-control']).toBe('no-store');
  expect(JSON.stringify(r.body)).not.toMatch(/SELECT|SQL|stack|contacto-ajeno|6149999999/);
}

describe('M4-T114–T115: superficie HTTP y ausencia de resultados parciales', () => {
  const previo = process.env.CITAS_MANUALES_HMAC_SECRET;
  beforeAll(() => { process.env.CITAS_MANUALES_HMAC_SECRET = 'secreto-fallos-finales-http-manual-m4'; });
  afterAll(() => { if (previo === undefined) delete process.env.CITAS_MANUALES_HMAC_SECRET; else process.env.CITAS_MANUALES_HMAC_SECRET = previo; });

  it('T114 400/401/403/404/409, campos desconocidos, límites y no-store conservan filas', async () => {
    await conAgendaHttp(async f => {
      const m = await prepararManual(f); const antes = await filasManuales(f.db);
      segura(await request(f.http).get('/citas?desde=2026-11-09&hasta=2026-11-09').expect(401));
      const profesional = f.actor(Rol.PROFESIONAL);
      segura(await request(f.http).post('/clientes').set('Authorization', `Bearer ${f.token(profesional.id)}`)
        .send({ nombreCompleto: 'No autorizado', telefono: '6141234567' }).expect(403));
      for (const ruta of ['/clientes', '/citas']) {
        segura(await request(f.http).get(`${ruta}?negocioId=2`).set('Authorization', m.auth).expect(400));
      }
      for (const entrada of [
        { nombreCompleto: 'x'.repeat(151), telefono: '6141234567' },
        { nombreCompleto: 'Persona', telefono: '61412345678' },
        { nombreCompleto: 'Persona', telefono: '6141234567', negocioId: f.negocios[1].id },
      ]) segura(await request(f.http).post('/clientes').set('Authorization', m.auth).send(entrada).expect(400));
      for (const seleccion of [{ ...m.nueva, notas: 'n'.repeat(2001) }, { ...m.nueva, costo: 1 }, { ...m.nueva, excluirCitaId: 1 }]) {
        segura(await request(f.http).post(RUTA_MANUAL).set('Authorization', m.auth).send({ clave: randomUUID(), seleccion }).expect(400));
      }
      for (const recurso of ['clientes', 'citas']) {
        const [ajeno] = await f.db.query(`SELECT id FROM ${recurso} WHERE negocio_id=? LIMIT 1`, [f.negocios[1].id]);
        const a = await request(f.http).get(`/${recurso}/${ajeno.id}`).set('Authorization', m.auth).expect(404);
        const b = await request(f.http).get(`/${recurso}/4294967295`).set('Authorization', m.auth).expect(404);
        segura(a); segura(b); expect(a.body).toEqual(b.body);
      }
      expect(await filasManuales(f.db)).toEqual(antes);
      const clave = randomUUID();
      segura(await request(f.http).post(RUTA_MANUAL).set('Authorization', m.auth).send({ clave, seleccion: m.nueva }).expect(201));
      const preparado = await filasManuales(f.db);
      segura(await request(f.http).post(RUTA_MANUAL).set('Authorization', m.auth)
        .send({ clave, seleccion: { ...m.nueva, notas: 'Contenido diferente' } }).expect(409));
      expect(await filasManuales(f.db)).toEqual(preparado);
    });
  });

  it.each([false, true].flatMap(temporal => ['citas', 'clientes'].map(tabla => ({ temporal, tabla }))))
    ('T115 lectura $tabla temporal=$temporal: error íntegro y reintento, nunca 200 vacío', async ({ temporal, tabla }) => {
      await conAgendaHttp(async f => {
        const m = await prepararManual(f); const antes = await filasManuales(f.db);
        const fallo = fallarSql(f.db, sql => sql.startsWith('SELECT') && sql.includes(`FROM \`${tabla}\``), temporal);
        const ruta = tabla === 'citas' ? '/citas?desde=2026-11-09&hasta=2026-11-09' : '/clientes';
        try {
          const r = await request(f.http).get(ruta).set('Authorization', m.auth).expect(temporal ? 503 : 500);
          segura(r); expect(fallo.aplicado()).toBe(true);
          expect(r.body).not.toHaveProperty(tabla);
        } finally { fallo.restaurar(); }
        expect(await filasManuales(f.db)).toEqual(antes);
        segura(await request(f.http).get(ruta).set('Authorization', m.auth).expect(200));
      });
    });

  it.each(['clientes', 'eventos_auditoria', 'citas', 'eventos_cita', 'intentos_cita_manual'])
    ('T115 fallo tras escritura real de %s revierte cliente/cita/evento/intento y permite reintento único', async tabla => {
      await conAgendaHttp(async f => {
        const m = await prepararManual(f); const clave = randomUUID();
        await request(f.http).post(RUTA_MANUAL).set('Authorization', m.auth).send({ clave, seleccion: m.nueva }).expect(201);
        const antes = await filasManuales(f.db);
        const fallo = fallarSql(f.db, sql => /^(UPDATE|INSERT INTO) /.test(sql) && sql.split('`')[1] === tabla, false);
        try {
          const r = await request(f.http).post(`${RUTA_MANUAL}/${clave}/registrar`).set('Authorization', m.auth).send(m.nueva).expect(500);
          segura(r); expect(fallo.aplicado()).toBe(true);
        } finally { fallo.restaurar(); }
        expect(await filasManuales(f.db)).toEqual(antes);
        const r = await request(f.http).post(`${RUTA_MANUAL}/${clave}/registrar`).set('Authorization', m.auth).send(m.nueva).expect(201);
        segura(r);
        const despues = await filasManuales(f.db);
        expect(despues.citas).toHaveLength(antes.citas.length + 1);
        expect(despues.clientes).toHaveLength(antes.clientes.length + 1);
        expect(despues.eventos).toHaveLength(antes.eventos.length + 1);
        expect(despues.auditoria).toHaveLength(antes.auditoria.length + 1);
        segura(await request(f.http).post(`${RUTA_MANUAL}/${clave}/registrar`).set('Authorization', m.auth).send(m.nueva).expect(200));
        expect(await filasManuales(f.db)).toEqual(despues);
      });
    });
});
