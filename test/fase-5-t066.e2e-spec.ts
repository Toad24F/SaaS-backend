import request from 'supertest';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { AccesoOperativoService } from '../src/citas/acceso-operativo.service';
import { RegistroCitaManualService } from '../src/citas/registro-cita-manual.service';
import { conAgendaHttp } from './support/agenda-http';
import { prepararManual, filasManuales, RUTA_MANUAL } from './support/cita-manual';

describe('M4-T066: recuperación HTTP cuando la respuesta se pierde de verdad', () => {
  const previo = process.env.CITAS_MANUALES_HMAC_SECRET;
  beforeAll(() => { process.env.CITAS_MANUALES_HMAC_SECRET = 'secreto-fijo-recuperacion-http-manual-t066'; });
  afterAll(() => { if (previo === undefined) delete process.env.CITAS_MANUALES_HMAC_SECRET; else process.env.CITAS_MANUALES_HMAC_SECRET = previo; });

  it.each(['antes', 'despues'])('pierde respuesta con fallo %s del commit y resuelve sin duplicar', async (momento) => {
    await conAgendaHttp(async (f) => {
      const m = await prepararManual(f);
      const clave = randomUUID();
      await request(f.http).post(RUTA_MANUAL).set('Authorization', m.auth).send({ clave, seleccion: m.nueva }).expect(201);
      const antes = await filasManuales(f.db);
      const trazas: jest.SpyInstance[] = [];
      let fabrica: jest.SpyInstance | undefined;
      let fallo = false;
      let cortada = false;
      let respuestaEnCurso: ServerResponse | undefined;
      let finalizar!: () => void;
      const finEscritor = new Promise<void>((r) => { finalizar = r; });
      const registro = f.app.get(RegistroCitaManualService);
      const registrar = registro.registrarConMeta.bind(registro);
      // Observar el final del escritor permite esperar su rollback aun si el socket ya se perdió.
      const escritor = jest.spyOn(registro, 'registrarConMeta').mockImplementation(async (...args) => {
        try { return await registrar(...args); } finally { finalizar(); }
      });
      // Después del commit se corta antes de transmitir; antes del commit se corta desde el SQL.
      // En ambos órdenes el cliente recibe ECONNRESET sin resultado utilizable.
      const perder = (_req: IncomingMessage, res: ServerResponse) => {
        respuestaEnCurso = res;
        if (momento === 'despues') trazas.push(jest.spyOn(res, 'end').mockImplementation(() => { cortada = true; res.destroy(); return res; }));
      };
      try {
        if (momento === 'antes') {
          const crear = f.db.createQueryRunner.bind(f.db);
          fabrica = jest.spyOn(f.db, 'createQueryRunner').mockImplementation((...args) => {
            const runner = crear(...args);
            const ejecutar = runner.query.bind(runner);
            trazas.push(jest.spyOn(runner, 'query').mockImplementation(async (...consulta) => {
              const valor = await ejecutar(...consulta);
              // Fallar después de insertar realmente la ficha exige revertir esa fila antes de resolver.
              if (!fallo && consulta[0].startsWith('INSERT INTO `clientes`')) {
                fallo = true; cortada = true; respuestaEnCurso!.destroy();
                throw new Error('Fallo controlado previo al commit');
              }
              return valor;
            }));
            return runner;
          });
        }
        f.http.prependOnceListener('request', perder);
        const perdida = await request(f.http).post(`${RUTA_MANUAL}/${clave}/registrar`).set('Authorization', m.auth).send(m.nueva)
          .then((respuesta) => ({ respuesta, error: undefined }), (error: { code: string; response?: unknown }) => ({ respuesta: undefined, error }));
        let limite: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([finEscritor, new Promise<never>((_r, rechazar) => {
            limite = setTimeout(() => rechazar(new Error('El escritor no finalizó tras perder el socket.')), 6000);
          })]);
        } finally { clearTimeout(limite); }
        expect(cortada).toBe(true);
        expect(perdida.respuesta).toBeUndefined();
        expect(perdida.error?.code).toBe('ECONNRESET');
        expect(perdida.error?.response).toBeUndefined();
        expect(fallo).toBe(momento === 'antes');
      } finally {
        f.http.removeListener('request', perder);
        fabrica?.mockRestore(); escritor.mockRestore(); for (const traza of trazas) traza.mockRestore();
      }
      const trasPerdida = await filasManuales(f.db);
      if (momento === 'antes') expect(trasPerdida).toEqual(antes);
      else {
        expect(trasPerdida.citas).toHaveLength(antes.citas.length + 1);
        expect(trasPerdida.clientes).toHaveLength(antes.clientes.length + 1);
        expect(trasPerdida.eventos).toHaveLength(antes.eventos.length + 1);
        expect(trasPerdida.auditoria).toHaveLength(antes.auditoria.length + 1);
      }
      const resuelta = await request(f.http).post(`${RUTA_MANUAL}/${clave}/resolver`).set('Authorization', m.auth).send(m.nueva).expect(200);
      expect(resuelta.headers['cache-control']).toBe('no-store');
      if (momento === 'antes') {
        expect(resuelta.body).toEqual({ estado: 'no_registrado' });
        await request(f.http).post(`${RUTA_MANUAL}/${clave}/registrar`).set('Authorization', m.auth).send(m.nueva).expect(409);
        await request(f.http).post(RUTA_MANUAL).set('Authorization', m.auth).send({ clave, seleccion: m.nueva }).expect(409);
        const final = await filasManuales(f.db);
        expect({ ...final, intentos: [] }).toEqual({ ...antes, intentos: [] });
        expect(final.intentos.find((i) => i.clave === clave)).toMatchObject({ estado: 'no_registrado', citaId: null });
      } else {
        const cita = trasPerdida.citas.find((c) => !antes.citas.some((anterior) => anterior.id === c.id))!;
        expect(resuelta.body).toMatchObject({ estado: 'registrado', resultado: { id: cita.id, folio: cita.folio, estado: 'confirmada' } });
        const repetida = await request(f.http).post(`${RUTA_MANUAL}/${clave}/registrar`).set('Authorization', m.auth).send(m.nueva).expect(200);
        expect(repetida.body).toEqual(resuelta.body.resultado);
        expect(await filasManuales(f.db)).toEqual(trasPerdida);
      }
      const final = await filasManuales(f.db);
      const otraResolucion = await request(f.http).post(`${RUTA_MANUAL}/${clave}/resolver`).set('Authorization', m.auth).send(m.nueva).expect(200);
      expect(otraResolucion.body).toEqual(resuelta.body);
      expect(await filasManuales(f.db)).toEqual(final);
    });
  });

  it('503 por espera SQL real mantiene incertidumbre sin crear ausencia terminal', async () => {
    await conAgendaHttp(async (f) => {
      const m = await prepararManual(f);
      const clave = randomUUID();
      await request(f.http).post(RUTA_MANUAL).set('Authorization', m.auth).send({ clave, seleccion: m.nueva }).expect(201);
      const antes = await filasManuales(f.db);
      const holder = f.segunda.createQueryRunner();
      const acceso = f.app.get(AccesoOperativoService);
      const resolver = acceso.resolverEnTransaccion.bind(acceso);
      const espia = jest.spyOn(acceso, 'resolverEnTransaccion').mockImplementation(async (...args) => {
        const ctx = await resolver(...args);
        // Timeout acotado a una conexión test; no se modifica la configuración global de MariaDB.
        await ctx.manager.query('SET SESSION innodb_lock_wait_timeout=1');
        return ctx;
      });
      try {
        await holder.connect(); await holder.startTransaction('READ COMMITTED');
        await holder.query('SELECT id FROM usuarios WHERE id=? FOR UPDATE', [m.actor.id]);
        const r = await request(f.http).post(`${RUTA_MANUAL}/${clave}/resolver`).set('Authorization', m.auth).send(m.nueva).expect(503);
        expect(r.headers['cache-control']).toBe('no-store');
        expect(r.body).not.toHaveProperty('estado');
        expect(JSON.stringify(r.body)).not.toMatch(/SQL|SELECT|stack|6141234567/);
        expect(await filasManuales(f.db)).toEqual(antes);
        await holder.rollbackTransaction();
        const resuelta = await request(f.http).post(`${RUTA_MANUAL}/${clave}/resolver`).set('Authorization', m.auth).send(m.nueva).expect(200);
        expect(resuelta.body).toEqual({ estado: 'no_registrado' });
      } finally {
        if (holder.isTransactionActive) await holder.rollbackTransaction();
        await holder.release(); espia.mockRestore();
      }
    });
  });
});
