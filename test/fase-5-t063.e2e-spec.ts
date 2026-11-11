import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { Rol } from '../src/auth/enums/rol.enum';
import { Cliente } from '../src/disponibilidad/entities/cliente.entity';
import { Cita } from '../src/disponibilidad/entities/cita.entity';
import { conAgendaHttp } from './support/agenda-http';
import { prepararManual, filasManuales, RUTA_MANUAL } from './support/cita-manual';

describe('M4-T063: reserva manual válida por HTTP y cupo sin fusionar fichas', () => {
  const previo = process.env.CITAS_MANUALES_HMAC_SECRET;
  beforeAll(() => { process.env.CITAS_MANUALES_HMAC_SECRET = 'secreto-fijo-de-aceptacion-manual-t063'; });
  afterAll(() => { if (previo === undefined) delete process.env.CITAS_MANUALES_HMAC_SECRET; else process.env.CITAS_MANUALES_HMAC_SECRET = previo; });

  it.each([Rol.ADMIN_NEGOCIO, Rol.RECEPCIONISTA].flatMap((rol) => [false, true].map((nuevo) => ({ rol, nuevo }))))
   ('$rol registra nuevo=$nuevo con snapshot completo y una sola ocupación protegida', async ({ rol, nuevo }) => {
      await conAgendaHttp(async (f) => {
        const m = await prepararManual(f, rol);
        const seleccion = nuevo ? m.nueva : m.seleccion;
        await f.db.query('UPDATE servicios SET costo=145.75,duracion_minutos=45 WHERE id=?', [seleccion.servicioId]);
        const ficha = await f.db.getRepository(Cliente).findOneByOrFail({ id: m.seleccion.clienteId });
        const [negocio] = await f.db.query('SELECT nombre FROM negocios WHERE id=?', [f.negocios[0].id]);
        const [sucursal] = await f.db.query('SELECT nombre FROM sucursales WHERE id=?', [seleccion.sucursalId]);
        const [servicio] = await f.db.query('SELECT nombre FROM servicios WHERE id=?', [seleccion.servicioId]);
        const [profesional] = await f.db.query('SELECT nombre FROM usuarios WHERE id=?', [seleccion.personalId]);
        const clave = randomUUID();
        await request(f.http).post(RUTA_MANUAL).set('Authorization', m.auth).send({ clave, seleccion }).expect(201);
        const antes = await filasManuales(f.db);
        const respuesta = await request(f.http).post(`${RUTA_MANUAL}/${clave}/registrar`).set('Authorization', m.auth).send(seleccion).expect(201);
        expect(respuesta.headers['cache-control']).toBe('no-store');
        expect(respuesta.body).toEqual({ id: expect.any(Number), clienteId: nuevo ? expect.any(Number) : ficha.id,
          folio: expect.stringMatching(/^M-[A-F0-9]{18}$/), estado: 'confirmada', origen: 'manual', version: 1,
          sucursalId: seleccion.sucursalId, personalId: seleccion.personalId, servicioId: seleccion.servicioId,
          inicioUtc: '2026-11-09T15:17:00.000Z', finUtc: '2026-11-09T16:02:00.000Z', finOcupacionUtc: '2026-11-09T16:12:00.000Z',
          separacionMinutos: 10, zonaHoraria: 'America/Chihuahua', costoAceptado: '145.75',
          nombreContacto: nuevo ? m.nueva.clienteNuevo.nombreCompleto : ficha.nombreCompleto, telefonoContacto: '6141234567',
          motivoConsulta: seleccion.notas, nombreNegocio: negocio.nombre, nombreSucursal: sucursal.nombre,
          nombreServicio: servicio.nombre, nombreProfesional: profesional.nombre });
        const r = respuesta.body;
        expect(typeof r.clienteId).toBe('number');
        if (nuevo) expect(r.clienteId).not.toBe(ficha.id);
        const despues = await filasManuales(f.db);
        expect(despues.citas).toHaveLength(antes.citas.length + 1);
        expect(despues.clientes).toHaveLength(antes.clientes.length + Number(nuevo));
        expect(despues.eventos).toHaveLength(antes.eventos.length + 1);
        expect(despues.auditoria).toHaveLength(antes.auditoria.length + Number(nuevo));
        expect(despues.clientes.filter((c) => c.id !== r.clienteId || !nuevo)).toEqual(antes.clientes);
        expect(despues.citas.filter((c) => c.id !== r.id)).toEqual(antes.citas);
        expect(despues.eventos.find((e) => e.citaId === r.id)).toMatchObject({ accion: 'alta', actorUsuarioId: m.actor.id, versionResultante: 1 });
        expect(despues.intentos.find((i) => i.clave === clave)).toMatchObject({ estado: 'registrado', citaId: r.id });
        expect(await f.db.getRepository(Cita).findOneByOrFail({ id: r.id })).toMatchObject({ estado: 'confirmada', origen: 'manual',
          costoAceptado: r.costoAceptado, inicioUtc: new Date(r.inicioUtc), finUtc: new Date(r.finUtc), finOcupacionUtc: new Date(r.finOcupacionUtc) });
        // La modalidad manual acepta 09:17 con horizonte cero/anticipación alta; el snapshot no cambia con el catálogo.
        await f.db.query('UPDATE servicios SET costo=999,duracion_minutos=90 WHERE id=?', [seleccion.servicioId]);
        const recuperada = await request(f.http).post(`${RUTA_MANUAL}/${clave}/resolver`).set('Authorization', m.auth).send(seleccion).expect(200);
        expect(recuperada.body).toEqual({ estado: 'registrado', resultado: r });
        expect(await filasManuales(f.db)).toEqual(despues);
      });
    });

  it('rechaza la tercera cita futura del teléfono normalizado sin persona/cita/evento parcial', async () => {
    await conAgendaHttp(async (f) => {
      const m = await prepararManual(f);
      const ficha = await f.db.getRepository(Cliente).findOneByOrFail({ id: m.seleccion.clienteId });
      const resultados: { id: number; clienteId: number; folio: string }[] = [];
      for (const [indice, seleccion] of [m.seleccion, { ...m.nueva, horaInicio: '10:17' }, { ...m.nueva, horaInicio: '11:17' }].entries()) {
        const clave = randomUUID();
        await request(f.http).post(RUTA_MANUAL).set('Authorization', m.auth).send({ clave, seleccion }).expect(201);
        const antes = await filasManuales(f.db);
        const r = await request(f.http).post(`${RUTA_MANUAL}/${clave}/registrar`).set('Authorization', m.auth).send(seleccion).expect(indice < 2 ? 201 : 409);
        if (indice < 2) resultados.push(r.body);
        else {
          expect(r.body.message).toBe('No se puede registrar otra cita con este teléfono en esta sucursal. Contacta al negocio');
          expect(await filasManuales(f.db)).toEqual(antes);
          expect(antes.intentos.find((i) => i.clave === clave)?.estado).toBe('preparado');
        }
      }
      expect(new Set(resultados.map((r) => r.folio)).size).toBe(2);
      expect(new Set(resultados.map((r) => r.clienteId)).size).toBe(2);
      expect(await f.db.getRepository(Cliente).findOneByOrFail({ id: ficha.id })).toEqual(ficha);
    });
  });
});
