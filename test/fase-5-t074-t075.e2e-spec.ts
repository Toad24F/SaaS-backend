import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { Rol } from '../src/auth/enums/rol.enum';
import { CambioEstadoCitaService } from '../src/citas/cambio-estado-cita.service';
import { Cita } from '../src/disponibilidad/entities/cita.entity';
import { conAgendaHttp } from './support/agenda-http';
import { prepararEstado, ocupacionesEstado } from './support/estado-cita';
import { filasManuales } from './support/cita-manual';
import { situarSesion } from './support/acceso-operativo';

describe('M4-T074–T075: cambio privado de estado y cinco estados por HTTP', () => {
  const entorno = { CITAS_MANUALES_HMAC_SECRET: 'secreto-estable-http-estados-t074-t075',
    PORTAL_PUBLICO_ORIGEN: 'https://citas.example.test', PORTAL_CSRF_SECRET: 'secreto-csrf-test-estados-publicos-1234567890',
    PORTAL_FORMULARIO_HMAC_SECRET: 'secreto-formulario-test-estados-publicos-1234567890' };
  const anteriores = Object.fromEntries(Object.keys(entorno).map((k) => [k, process.env[k]]));
  beforeAll(() => { Object.assign(process.env, entorno); });
  afterAll(() => { for (const [k, valor] of Object.entries(anteriores)) { if (valor === undefined) delete process.env[k]; else process.env[k] = valor; } });

  it.each([Rol.ADMIN_NEGOCIO, Rol.RECEPCIONISTA])('T074 %s cambia, repite y recibe versión vigente con actor real en historial', async (rol) => {
    await conAgendaHttp(async (f) => {
      const m = await prepararEstado(f, rol);
      const r = await request(f.http).patch(m.ruta).set('Authorization', m.auth).send({ estado: 'pendiente', version: 1 }).expect(200);
      expect(r.headers['cache-control']).toBe('no-store');
      expect(r.body).toEqual({ id: m.cita.id, folio: m.cita.folio, estado: 'pendiente', version: 2 });
      const antes = await filasManuales(f.db);
      expect((await request(f.http).patch(m.ruta).set('Authorization', m.auth).send({ estado: 'pendiente', version: 2 }).expect(200)).body).toEqual(r.body);
      await request(f.http).patch(m.ruta).set('Authorization', m.auth).send({ estado: 'cancelada', version: 1 }).expect(409);
      expect(await filasManuales(f.db)).toEqual(antes);
      const historia = await request(f.http).get(`/citas/${m.cita.id}/historial`).set('Authorization', m.auth).expect(200);
      expect(historia.body.eventos[1]).toMatchObject({ actorUsuarioId: m.actor.id, versionResultante: 2,
        valoresAntes: { estado: 'confirmada', version: 1 }, valoresDespues: { estado: 'pendiente', version: 2 } });
      expect(historia.body.eventos[1]).not.toHaveProperty('motivo');
    });
  });

  it('T074 rechaza 400/401/403/404 sin cambiar filas ni usar claims o recursos ajenos', async () => {
    await conAgendaHttp(async (f) => {
      const m = await prepararEstado(f);
      const antes = await filasManuales(f.db);
      const datos = { estado: 'cancelada', version: 1 };
      const anonima = await request(f.http).patch(m.ruta).send(datos).expect(401);
      expect(anonima.headers['cache-control']).toBe('no-store');
      for (const actor of f.actores.filter((a) => [Rol.PROFESIONAL, Rol.SUPERADMIN].includes(a.rol))) {
        const r = await request(f.http).patch(m.ruta).set('Authorization', `Bearer ${f.token(actor.id)}`).send(datos).expect(403);
        expect(r.headers['cache-control']).toBe('no-store');
      }
      const ajena = await request(f.http).patch(`/citas/${f.negocios[1].ocupaciones[0]}/estado`).set('Authorization', m.auth).send(datos).expect(404);
      const ausente = await request(f.http).patch('/citas/4294967295/estado').set('Authorization', m.auth).send(datos).expect(404);
      expect(ajena.body).toEqual(ausente.body);
      for (const entrada of [{ ...datos, negocioId: 1 }, { ...datos, actorUsuarioId: m.actor.id }, { ...datos, estado: 'Confirmada' },
        { ...datos, version: '1' }, { ...datos, motivo: 'x'.repeat(2001) }, { estado: 'confirmada' }]) {
        expect((await request(f.http).patch(m.ruta).set('Authorization', m.auth).send(entrada).expect(400)).headers['cache-control']).toBe('no-store');
      }
      await request(f.http).patch('/citas/01/estado').set('Authorization', m.auth).send(datos).expect(400);
      expect(await filasManuales(f.db)).toEqual(antes);
    });
  });

  it.each(['sesion', 'licencia'])('T074 una %s inválida deniega una sesión ya abierta con 401', async (recurso) => {
    await conAgendaHttp(async (f) => {
      const m = await prepararEstado(f);
      if (recurso === 'sesion') await f.db.query('UPDATE sesiones SET revocada_en=? WHERE id=?', [f.reloj.ahora(), m.actor.sesionId]);
      else await f.db.query('UPDATE licencias SET vence_en=? WHERE negocio_id=?', [f.reloj.ahora(), f.negocios[0].id]);
      const antes = await filasManuales(f.db);
      const r = await request(f.http).patch(m.ruta).set('Authorization', m.auth).send({ estado: 'cancelada', version: 1 }).expect(401);
      expect(r.headers['cache-control']).toBe('no-store'); expect(await filasManuales(f.db)).toEqual(antes);
    });
  });

  it('T074 normaliza fallos inesperados y temporales a 500/503 sin SQL ni datos personales', async () => {
    await conAgendaHttp(async (f) => {
      const m = await prepararEstado(f);
      const antes = await filasManuales(f.db);
      const espia = jest.spyOn(f.app.get(CambioEstadoCitaService), 'cambiar').mockRejectedValueOnce(new Error('SELECT secreto 6141234567'))
        .mockRejectedValueOnce(Object.assign(new Error('stack SQL secreto'), { code: 'ER_LOCK_WAIT_TIMEOUT' }));
      try {
        for (const codigo of [500, 503]) {
          const r = await request(f.http).patch(m.ruta).set('Authorization', m.auth).send({ estado: 'cancelada', version: 1 }).expect(codigo);
          expect(r.headers['cache-control']).toBe('no-store');
          expect(JSON.stringify(r.body)).not.toMatch(/SELECT|SQL|secreto|stack|6141234567/);
        }
      } finally { espia.mockRestore(); }
      expect(await filasManuales(f.db)).toEqual(antes);
    });
  });

  it.each(['completada', 'no_asistio'].flatMap((estado) => [-1, 0, 1].map((delta) => ({ estado, delta }))))
    ('T075 $estado a finUtc+$delta ms conserva ocupación salvo Cancelada', async ({ estado, delta }) => {
      await conAgendaHttp(async (f) => {
        const m = await prepararEstado(f);
        expect(m.cita.estado).toBe('confirmada');
        expect((await ocupacionesEstado(f, m.cita)).some((o) => o.tipo === 'cita' && o.id === m.cita.id)).toBe(true);
        // Se recorre Pendiente además del estado Confirmada de alta antes del límite temporal.
        await request(f.http).patch(m.ruta).set('Authorization', m.auth).send({ estado: 'pendiente', version: 1 }).expect(200);
        expect((await ocupacionesEstado(f, m.cita)).some((o) => o.tipo === 'cita' && o.id === m.cita.id)).toBe(true);
        const ahora = new Date(Date.parse(m.cita.finUtc) + delta);
        await situarSesion(f.db, m.actor, ahora); f.reloj.fijar(ahora);
        const antes = await filasManuales(f.db);
        const r = await request(f.http).patch(m.ruta).set('Authorization', m.auth).send({ estado, version: 2, ...(estado === 'no_asistio' ? { motivo: 'No llegó' } : {}) })
          .expect(delta < 0 ? 409 : 200);
        expect(r.headers['cache-control']).toBe('no-store');
        if (delta < 0) expect(await filasManuales(f.db)).toEqual(antes);
        else {
          expect(r.body).toMatchObject({ estado, version: 3 });
          expect((await ocupacionesEstado(f, m.cita)).some((o) => o.tipo === 'cita' && o.id === m.cita.id)).toBe(true);
          // Corregir un estado final agrega evento; cancelarlo después libera únicamente su intervalo.
          const corregida = await request(f.http).patch(m.ruta).set('Authorization', m.auth).send({ estado: 'confirmada', version: 3 }).expect(200);
          expect(corregida.body).toMatchObject({ estado: 'confirmada', version: 4 });
          expect((await ocupacionesEstado(f, m.cita)).some((o) => o.tipo === 'cita' && o.id === m.cita.id)).toBe(true);
          const cancelada = await request(f.http).patch(m.ruta).set('Authorization', m.auth).send({ estado: 'cancelada', version: 4 }).expect(200);
          expect(cancelada.body).toMatchObject({ estado: 'cancelada', version: 5 });
          expect((await ocupacionesEstado(f, m.cita)).some((o) => o.tipo === 'cita' && o.id === m.cita.id)).toBe(false);
          const h = await request(f.http).get(`/citas/${m.cita.id}/historial`).set('Authorization', m.auth).expect(200);
          expect(h.body.eventos.map((e: { versionResultante: number }) => e.versionResultante)).toEqual([1, 2, 3, 4, 5]);
        }
        const cita = await f.db.getRepository(Cita).findOneByOrFail({ id: m.cita.id });
        expect(cita).toMatchObject({ inicioUtc: new Date(m.cita.inicioUtc), finUtc: new Date(m.cita.finUtc), finOcupacionUtc: new Date(m.cita.finOcupacionUtc),
          zonaHorariaReserva: m.cita.zonaHoraria, motivoConsulta: m.seleccion.notas });
      });
    });

  it('T075 una reserva pública real permanece Pendiente y ocupada después del fin, sin caducidad automática', async () => {
    await conAgendaHttp(async (f) => {
      const m = await prepararEstado(f);
      await f.db.query("UPDATE configuracion_agenda SET modo='ventana_libre',anticipacion_minutos=15,dias_futuros=60 WHERE negocio_id=?", [f.negocios[0].id]);
      const base = '/publico/negocios/portal-prueba-1';
      const origen = entorno.PORTAL_PUBLICO_ORIGEN;
      const sesion = await request(f.http).post(`${base}/sesion`).set('Origin', origen).set('X-Portal-Inicializacion', '1').expect(201);
      const post = (ruta: string, cuerpo: object) => request(f.http).post(`${base}${ruta}`).set('Origin', origen)
        .set('Cookie', sesion.headers['set-cookie'][0].split(';')[0]).set('X-CSRF-Token', sesion.body.csrfToken).send(cuerpo);
      const apartado = await post('/apartados', { clave: randomUUID(), servicioId: m.seleccion.servicioId, sucursalId: m.seleccion.sucursalId,
        personalId: m.seleccion.personalId, fechaLocal: m.seleccion.fechaLocal, horaInicio: '08:00' }).expect(201);
      const clave = randomUUID(); await post('/intentos', { clave, apartadoId: apartado.body.apartadoId }).expect(201);
      const registrada = await post(`/intentos/${clave}/reservar`, { nombre: 'Persona del portal', telefono: '6140007777', notas: 'Nota del portal' }).expect(201);
      const cita = await f.db.getRepository(Cita).findOneByOrFail({ origen: 'portal_publico', negocioId: f.negocios[0].id, telefonoContacto: '6140007777' });
      expect(cita.folio).toBe(registrada.body.folio);
      expect(cita.estado).toBe('pendiente');
      const ahora = new Date(cita.finUtc.getTime() + 1); await situarSesion(f.db, m.actor, ahora); f.reloj.fijar(ahora);
      const antes = await filasManuales(f.db);
      for (let n = 0; n < 2; n++) {
        const detalle = await request(f.http).get(`/citas/${cita.id}`).set('Authorization', m.auth).expect(200);
        expect(detalle.body).toMatchObject({ estado: 'pendiente', origen: 'portal_publico', version: 1 });
      }
      expect((await ocupacionesEstado(f, { personalId: cita.personalId, inicioUtc: cita.inicioUtc.toISOString(), finOcupacionUtc: cita.finOcupacionUtc!.toISOString() }))
        .some((o) => o.tipo === 'cita' && o.id === cita.id)).toBe(true);
      expect(await filasManuales(f.db)).toEqual(antes);
    });
  });
});
