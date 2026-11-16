import request from 'supertest';
import { Rol } from '../src/auth/enums/rol.enum';
import { CambioHorarioCitaService } from '../src/citas/cambio-horario-cita.service';
import { conAgendaHttp } from './support/agenda-http';
import { prepararMovimiento, DESTINO_HORARIO } from './support/horario-cita';
import { filasManuales } from './support/cita-manual';
import { situarSesion } from './support/acceso-operativo';

/** La frontera HTTP usa JWT y MariaDB reales; las comparaciones completas detectan escrituras parciales. */
describe('M4-T083–T086: cambio privado de horario por HTTP', () => {
  const previo = process.env.CITAS_MANUALES_HMAC_SECRET;
  beforeAll(() => { process.env.CITAS_MANUALES_HMAC_SECRET = 'secreto-estable-http-movimiento-t083-t086'; });
  afterAll(() => { if (previo === undefined) delete process.env.CITAS_MANUALES_HMAC_SECRET; else process.env.CITAS_MANUALES_HMAC_SECRET = previo; });

  it.each([Rol.ADMIN_NEGOCIO, Rol.RECEPCIONISTA])('T083/T086 %s mueve y consulta historial, conserva snapshots y no sobrescribe con versión vieja', async rol => {
    await conAgendaHttp(async f => {
      const m = await prepararMovimiento(f, rol);
      const antes = await filasManuales(f.db); const original = antes.citas.find(c => c.id === m.cita.id)!;
      const r = await request(f.http).patch(m.ruta).set('Authorization', m.auth).send(DESTINO_HORARIO).expect(200);
      expect(r.headers['cache-control']).toBe('no-store');
      expect(r.body).toEqual({ id: m.cita.id, folio: m.cita.folio, estado: 'confirmada', version: 2, zonaHoraria: m.cita.zonaHoraria,
        inicioUtc: '2026-11-09T15:20:00.000Z', finUtc: '2026-11-09T15:50:00.000Z', finOcupacionUtc: '2026-11-09T16:00:00.000Z' });
      const despues = await filasManuales(f.db);
      expect(despues.citas).toEqual(antes.citas.map(c => c.id === m.cita.id ? { ...c, version: 2,
        inicioUtc: new Date(r.body.inicioUtc), finUtc: new Date(r.body.finUtc), finOcupacionUtc: new Date(r.body.finOcupacionUtc) } : c));
      expect(despues.clientes).toEqual(antes.clientes); expect(despues.intentos).toEqual(antes.intentos); expect(despues.auditoria).toEqual(antes.auditoria);
      expect(despues.eventos.slice(0, -1)).toEqual(antes.eventos);
      expect(despues.eventos.at(-1)).toMatchObject({ accion: 'cambio_horario', actorUsuarioId: m.actor.id, ocurridoEn: f.reloj.ahora(), versionResultante: 2,
        valoresAntes: { inicioUtc: original.inicioUtc.toISOString(), finUtc: original.finUtc.toISOString(), finOcupacionUtc: original.finOcupacionUtc!.toISOString(), zonaHoraria: original.zonaHorariaReserva, version: 1 },
        valoresDespues: { inicioUtc: r.body.inicioUtc, finUtc: r.body.finUtc, finOcupacionUtc: r.body.finOcupacionUtc, zonaHoraria: original.zonaHorariaReserva, version: 2 } });
      const h = await request(f.http).get(`/citas/${m.cita.id}/historial`).set('Authorization', m.auth).expect(200);
      expect(h.body.eventos.at(-1)).toMatchObject({ accion: 'cambio_horario', versionResultante: 2, valoresAntes: { version: 1 }, valoresDespues: { version: 2 } });
      const detalle = await request(f.http).get(`/citas/${m.cita.id}`).set('Authorization', m.auth).expect(200);
      expect(detalle.body).toMatchObject({ id: original.id, folio: original.folio, version: 2, inicioUtc: r.body.inicioUtc });
      // Repetir el mismo horario vigente no crea evento; un segundo actor con versión antigua recibe conflicto.
      expect((await request(f.http).patch(m.ruta).set('Authorization', m.auth).send({ ...DESTINO_HORARIO, version: 2 }).expect(200)).body).toEqual(r.body);
      const otro = f.actor(rol === Rol.ADMIN_NEGOCIO ? Rol.RECEPCIONISTA : Rol.ADMIN_NEGOCIO);
      const vieja = await request(f.http).patch(m.ruta).set('Authorization', `Bearer ${f.token(otro.id)}`)
        .send({ ...DESTINO_HORARIO, horaInicio: '10:20' }).expect(409);
      expect(vieja.headers['cache-control']).toBe('no-store'); expect(await filasManuales(f.db)).toEqual(despues);
    });
  });

  it('T083 rechaza entrada, identidad y recursos ajenos con 400/401/403/404 sin fugas', async () => {
    await conAgendaHttp(async f => {
      const m = await prepararMovimiento(f); const antes = await filasManuales(f.db);
      expect((await request(f.http).patch(m.ruta).send(DESTINO_HORARIO).expect(401)).headers['cache-control']).toBe('no-store');
      for (const actor of f.actores.filter(a => [Rol.PROFESIONAL, Rol.SUPERADMIN].includes(a.rol))) {
        expect((await request(f.http).patch(m.ruta).set('Authorization', `Bearer ${f.token(actor.id)}`).send(DESTINO_HORARIO).expect(403)).headers['cache-control']).toBe('no-store');
      }
      const ajena = await request(f.http).patch(`/citas/${f.negocios[1].ocupaciones[0]}/horario`).set('Authorization', m.auth).send(DESTINO_HORARIO).expect(404);
      const ausente = await request(f.http).patch('/citas/4294967295/horario').set('Authorization', m.auth).send(DESTINO_HORARIO).expect(404);
      expect(ajena.body).toEqual(ausente.body); expect(ajena.headers['cache-control']).toBe('no-store');
      for (const entrada of [{}, { ...DESTINO_HORARIO, version: '1' }, { ...DESTINO_HORARIO, fechaLocal: '2026-02-30' }, { ...DESTINO_HORARIO, horaInicio: '24:00' },
        ...['negocioId', 'actorId', 'servicioId', 'sucursalId', 'personalId', 'clienteId', 'precio', 'finUtc', 'zonaHoraria', 'excluirCitaId'].map(campo => ({ ...DESTINO_HORARIO, [campo]: 1 }))]) {
        expect((await request(f.http).patch(m.ruta).set('Authorization', m.auth).send(entrada).expect(400)).headers['cache-control']).toBe('no-store');
      }
      await request(f.http).patch('/citas/01/horario').set('Authorization', m.auth).send(DESTINO_HORARIO).expect(400);
      expect(await filasManuales(f.db)).toEqual(antes);
    });
  });

  it.each(['sesion', 'licencia'])('T083 revalida %s de una sesión abierta', async recurso => {
    await conAgendaHttp(async f => {
      const m = await prepararMovimiento(f);
      if (recurso === 'sesion') await f.db.query('UPDATE sesiones SET revocada_en=? WHERE id=?', [f.reloj.ahora(), m.actor.sesionId]);
      else await f.db.query('UPDATE licencias SET vence_en=? WHERE negocio_id=?', [f.reloj.ahora(), f.negocios[0].id]);
      const antes = await filasManuales(f.db);
      const r = await request(f.http).patch(m.ruta).set('Authorization', m.auth).send(DESTINO_HORARIO).expect(401);
      expect(r.headers['cache-control']).toBe('no-store'); expect(await filasManuales(f.db)).toEqual(antes);
    });
  });

  it('T083 normaliza 500/503 sin revelar SQL, trazas ni contacto', async () => {
    await conAgendaHttp(async f => {
      const m = await prepararMovimiento(f); const antes = await filasManuales(f.db);
      const espia = jest.spyOn(f.app.get(CambioHorarioCitaService), 'cambiar').mockRejectedValueOnce(new Error('SQL secreto 6141234567'))
        .mockRejectedValueOnce(Object.assign(new Error('SELECT stack secreto'), { code: 'ER_LOCK_WAIT_TIMEOUT' }));
      try {
        for (const codigo of [500, 503]) {
          const r = await request(f.http).patch(m.ruta).set('Authorization', m.auth).send(DESTINO_HORARIO).expect(codigo);
          expect(r.headers['cache-control']).toBe('no-store'); expect(JSON.stringify(r.body)).not.toMatch(/SQL|SELECT|secreto|stack|6141234567/);
        }
      } finally { espia.mockRestore(); }
      expect(await filasManuales(f.db)).toEqual(antes);
    });
  });

  it.each(['ambigua', 'inexistente', 'destino_exacto', 'destino_pasado', 'original_exacto', 'original_pasado', 'cierre', 'cancelada'])
    ('T084 rechaza %s conservando cita y eventos', async caso => {
      await conAgendaHttp(async f => {
        const m = await prepararMovimiento(f); let entrada = { ...DESTINO_HORARIO };
        if (['ambigua', 'inexistente'].includes(caso)) {
          await f.db.query("UPDATE sucursales SET zona_horaria='America/New_York' WHERE id=?", [m.seleccion.sucursalId]);
          entrada = { ...entrada, fechaLocal: caso === 'ambigua' ? '2027-11-07' : '2027-03-14', horaInicio: caso === 'ambigua' ? '01:30' : '02:30' };
        }
        if (caso.startsWith('original_')) {
          const ahora = new Date(Date.parse(m.cita.inicioUtc) + Number(caso === 'original_pasado'));
          await situarSesion(f.db, m.actor, ahora); f.reloj.fijar(ahora);
        }
        if (caso.startsWith('destino_')) {
          const ahora = new Date('2026-11-09T14:20:00.000Z'); await situarSesion(f.db, m.actor, ahora); f.reloj.fijar(ahora);
          entrada.horaInicio = caso === 'destino_exacto' ? '08:20' : '08:19';
        }
        if (caso === 'cierre') await f.db.query('UPDATE horarios_personal SET fin_minutos=599 WHERE negocio_id=?', [f.negocios[0].id]);
        if (caso === 'cancelada') await request(f.http).patch(`/citas/${m.cita.id}/estado`).set('Authorization', m.auth).send({ estado: 'cancelada', version: 1 }).expect(200);
        if (caso === 'cancelada') entrada.version = 2;
        const antes = await filasManuales(f.db);
        const r = await request(f.http).patch(m.ruta).set('Authorization', m.auth).send(entrada).expect(['ambigua', 'inexistente'].includes(caso) ? 400 : 409);
        expect(r.headers['cache-control']).toBe('no-store'); expect(await filasManuales(f.db)).toEqual(antes);
      });
    });

  it('T084 interpreta la zona vigente, guarda la anterior/nueva y conserva el folio', async () => {
    await conAgendaHttp(async f => {
      const m = await prepararMovimiento(f);
      await f.db.query("UPDATE sucursales SET zona_horaria='America/Tijuana' WHERE id=?", [m.seleccion.sucursalId]);
      const r = await request(f.http).patch(m.ruta).set('Authorization', m.auth).send(DESTINO_HORARIO).expect(200);
      expect(r.body).toMatchObject({ folio: m.cita.folio, zonaHoraria: 'America/Tijuana', inicioUtc: '2026-11-09T17:20:00.000Z', finOcupacionUtc: '2026-11-09T18:00:00.000Z' });
      const h = await request(f.http).get(`/citas/${m.cita.id}/historial`).set('Authorization', m.auth).expect(200);
      expect(h.body.eventos.at(-1)).toMatchObject({ valoresAntes: { zonaHoraria: m.cita.zonaHoraria }, valoresDespues: { zonaHoraria: 'America/Tijuana' } });
    });
  });

  it.each(['cita', 'apartado'].flatMap(tipo => ['parcial', 'contiguo'].map(relacion => ({ tipo, relacion }))))
    ('T085 $tipo de otra sucursal: $relacion en el extremo protegido', async ({ tipo, relacion }) => {
      await conAgendaHttp(async f => {
        const m = await prepararMovimiento(f); const s = m.seleccion;
        const inicio = relacion === 'parcial' ? '2026-11-09 15:55:00' : '2026-11-09 16:00:00';
        // El rival invade solo la separación del destino o empieza exactamente en su fin protegido.
        if (tipo === 'cita') await f.db.query(`INSERT INTO citas
          (negocio_id,sucursal_id,personal_id,servicio_id,cliente_id,inicio_utc,fin_utc,zona_horaria_reserva,folio)
          VALUES(?,?,?,?,?,?,'2026-11-09 16:30:00','America/Mexico_City','RIVAL-T085')`,
          [f.negocios[0].id, f.negocios[0].sucursales[1].id, s.personalId, s.servicioId, s.clienteId, inicio]);
        else await f.db.query(`INSERT INTO bloqueos_temporales
          (negocio_id,sucursal_id,personal_id,servicio_id,inicio_utc,fin_utc,expira_en,titular_hash)
          VALUES(?,?,?,?,?,'2026-11-09 16:30:00',?,?)`, [f.negocios[0].id, f.negocios[0].sucursales[1].id, s.personalId, s.servicioId,
          inicio, new Date(f.reloj.ahora().getTime() + 300000), 'e'.repeat(64)]);
        const antes = await filasManuales(f.db); const apartados = await f.db.query('SELECT * FROM bloqueos_temporales ORDER BY id');
        const r = await request(f.http).patch(m.ruta).set('Authorization', m.auth).send(DESTINO_HORARIO).expect(relacion === 'parcial' ? 409 : 200);
        if (relacion === 'parcial') expect(await filasManuales(f.db)).toEqual(antes);
        else {
          expect(r.body).toMatchObject({ id: m.cita.id, folio: m.cita.folio, version: 2, finOcupacionUtc: '2026-11-09T16:00:00.000Z' });
          const despues = await filasManuales(f.db);
          expect(despues.citas).toEqual(antes.citas.map(c => c.id === m.cita.id ? { ...c, version: 2, inicioUtc: new Date(r.body.inicioUtc), finUtc: new Date(r.body.finUtc), finOcupacionUtc: new Date(r.body.finOcupacionUtc) } : c));
          expect(despues.citas.filter(c => c.folio === m.cita.folio)).toHaveLength(1);
        }
        expect(await f.db.query('SELECT * FROM bloqueos_temporales ORDER BY id')).toEqual(apartados);
      });
    });

  it.each(['citas', 'eventos_cita'])('T086 fallo tras SQL real en %s revierte movimiento y permite reintentar', async tabla => {
    await conAgendaHttp(async f => {
      const m = await prepararMovimiento(f); const antes = await filasManuales(f.db);
      const crear = f.db.createQueryRunner.bind(f.db); const trazas: jest.SpyInstance[] = []; let fallo = false;
      // Ejecutar primero el SQL verifica el rollback del cambio real y del evento, no una negativa previa.
      const espia = jest.spyOn(f.db, 'createQueryRunner').mockImplementation((...args) => {
        const runner = crear(...args); const ejecutar = runner.query.bind(runner);
        trazas.push(jest.spyOn(runner, 'query').mockImplementation(async (...consulta) => {
          const resultado = await ejecutar(...consulta);
          if (!fallo && /^(UPDATE|INSERT INTO) /.test(consulta[0]) && consulta[0].split('`')[1] === tabla) { fallo = true; throw new Error('SQL fallo controlado 6141234567'); }
          return resultado;
        })); return runner;
      });
      try {
        const r = await request(f.http).patch(m.ruta).set('Authorization', m.auth).send(DESTINO_HORARIO).expect(500);
        expect(fallo).toBe(true); expect(r.headers['cache-control']).toBe('no-store'); expect(JSON.stringify(r.body)).not.toMatch(/SQL|6141234567/);
      } finally { espia.mockRestore(); for (const traza of trazas) traza.mockRestore(); }
      expect(await filasManuales(f.db)).toEqual(antes);
      await request(f.http).patch(m.ruta).set('Authorization', m.auth).send(DESTINO_HORARIO).expect(200);
      const despues = await filasManuales(f.db);
      expect(despues.eventos).toHaveLength(antes.eventos.length + 1);
      expect(despues.eventos.at(-1)).toMatchObject({ accion: 'cambio_horario', versionResultante: 2 });
    });
  });
});
