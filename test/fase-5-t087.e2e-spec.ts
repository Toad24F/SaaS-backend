import request from 'supertest';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { RELOJ } from '../src/comun/reloj';
import { OcupacionesService } from '../src/disponibilidad/ocupaciones.service';
import { BloqueoTemporal } from '../src/disponibilidad/entities/bloqueo-temporal.entity';
import { OperacionApartado } from '../src/reservas-publicas/entities/operacion-apartado.entity';
import { conAgendaHttp } from './support/agenda-http';
import { prepararMovimiento } from './support/horario-cita';
import { filasManuales, esperarBloqueoManual } from './support/cita-manual';

const carreras = ['movimiento', 'apartado'].flatMap(primero => ['igual', 'separacion_otra_sucursal'].map(relacion => ({ primero, relacion })));

describe('M4-T087: movimiento HTTP contra apartado público real', () => {
  const entorno = { CITAS_MANUALES_HMAC_SECRET: 'secreto-carrera-movimiento-publico-t087',
    PORTAL_PUBLICO_ORIGEN: 'https://citas.example.test', PORTAL_CSRF_SECRET: 'secreto-csrf-carrera-movimiento-1234567890',
    PORTAL_FORMULARIO_HMAC_SECRET: 'secreto-formulario-carrera-movimiento-1234567890' };
  const anteriores = Object.fromEntries(Object.keys(entorno).map(k => [k, process.env[k]]));
  beforeAll(() => { Object.assign(process.env, entorno); });
  afterAll(() => { for (const [k, v] of Object.entries(anteriores)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });

  it.each(carreras)('primero=$primero, relación=$relacion deja una sola ocupación incompatible', async ({ primero, relacion }) => {
    await conAgendaHttp(async f => {
      const m = await prepararMovimiento(f); const s = m.seleccion;
      await f.db.query("UPDATE configuracion_agenda SET modo='ventana_libre',anticipacion_minutos=15,dias_futuros=60 WHERE negocio_id=?", [f.negocios[0].id]);
      const otraSucursal = relacion !== 'igual';
      const sucursalId = otraSucursal ? f.negocios[0].sucursales[1].id : s.sucursalId;
      if (otraSucursal) {
        // Oferta de prueba en la otra sede: su primer inicio público es 08:35 (UTC 14:35),
        // que invade solo los últimos cinco minutos de separación del destino manual 08:00–08:40.
        // La fixture se siembra directamente; no acredita al escritor de horarios/asignaciones.
        await f.db.query(`INSERT INTO horarios_personal
          (negocio_id,personal_id,dia_semana,orden,sucursal_id,inicio_minutos,fin_minutos,activo)
          VALUES(?,?,1,1,?,515,720,1)`, [f.negocios[0].id, s.personalId, sucursalId]);
      }
      const base = '/publico/negocios/portal-prueba-1'; const origen = entorno.PORTAL_PUBLICO_ORIGEN;
      const sesion = await request(f.http).post(`${base}/sesion`).set('Origin', origen).set('X-Portal-Inicializacion', '1').expect(201);
      const clave = randomUUID();
      const seleccion = { clave, servicioId: s.servicioId, sucursalId, personalId: s.personalId,
        fechaLocal: s.fechaLocal, horaInicio: otraSucursal ? '08:35' : '08:00' };
      const destino = { fechaLocal: s.fechaLocal, horaInicio: '08:00', version: 1 };
      const modulo = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(DataSource).useValue(f.segunda)
        .overrideProvider(RELOJ).useValue(f.reloj).compile();
      const otraApp = modulo.createNestApplication();
      try { await otraApp.init(); } catch (e) { await otraApp.close(); throw e; }
      const trazas: jest.SpyInstance[] = []; const espias: jest.SpyInstance[] = [];
      let conexionA = 0; let conexionB = 0; let pausa = false;
      let retenido!: () => void; let abrir!: () => void;
      const bloqueado = new Promise<void>(r => { retenido = r; }); const barrera = new Promise<void>(r => { abrir = r; });
      let a: Promise<request.Response> | undefined; let b: Promise<request.Response> | undefined;
      try {
        const antes = await filasManuales(f.db); const apartadosAntes = await f.db.getRepository(BloqueoTemporal).find({ order: { id: 'ASC' } });
        for (const [db, esA] of [[f.db, true], [f.segunda, false]] as const) {
          const crear = db.createQueryRunner.bind(db);
          espias.push(jest.spyOn(db, 'createQueryRunner').mockImplementation((...args) => {
            const runner = crear(...args); const ejecutar = runner.query.bind(runner);
            trazas.push(jest.spyOn(runner, 'query').mockImplementation(async (...consulta) => {
              // La conexión rival se identifica antes de esperar; ambos observadores delegan siempre el SQL real.
              if (consulta[0].includes('FOR UPDATE')) {
                const id = Number((await ejecutar('SELECT CONNECTION_ID() id'))[0].id);
                if (esA) conexionA = id; else conexionB = id;
              }
              const resultado = await ejecutar(...consulta);
              // Pausar después de adquirir el perfil común fija el orden efectivo de los escritores reales.
              if (esA && !pausa && /FROM [`]?personal[`]?\s/.test(consulta[0]) && consulta[0].includes('FOR UPDATE')) {
                pausa = true; retenido(); await barrera;
              }
              return resultado;
            })); return runner;
          }));
        }
        const mover = (http: ReturnType<typeof f.app.getHttpServer>) => request(http).patch(m.ruta).set('Authorization', m.auth).send(destino);
        const apartar = (http: ReturnType<typeof f.app.getHttpServer>) => request(http).post(`${base}/apartados`).set('Origin', origen)
          .set('Cookie', sesion.headers['set-cookie'][0].split(';')[0]).set('X-CSRF-Token', sesion.body.csrfToken).send(seleccion);
        a = (primero === 'movimiento' ? mover(f.http) : apartar(f.http)).then(r => r);
        await Promise.race([bloqueado, a.then(() => { throw new Error('El primer escritor terminó antes del bloqueo común.'); })]);
        b = (primero === 'movimiento' ? apartar(otraApp.getHttpServer()) : mover(otraApp.getHttpServer())).then(r => r);
        await esperarBloqueoManual(f.db, () => conexionB, 'usuarios');
        expect(conexionA).not.toBe(conexionB); expect(conexionA).toBeGreaterThan(0); expect(conexionB).toBeGreaterThan(0);
        abrir(); const [rA, rB] = await Promise.all([a, b]);
        const movimiento = primero === 'movimiento' ? rA : rB; const apartado = primero === 'apartado' ? rA : rB;
        const ganaMovimiento = primero === 'movimiento';
        expect(movimiento.status).toBe(ganaMovimiento ? 200 : 409); expect(apartado.status).toBe(ganaMovimiento ? 409 : 201);
        expect(movimiento.headers['cache-control']).toBe('no-store'); expect(apartado.headers['cache-control']).toBe('no-store');
        const despues = await filasManuales(f.db);
        expect(despues.clientes).toEqual(antes.clientes); expect(despues.auditoria).toEqual(antes.auditoria); expect(despues.intentos).toEqual(antes.intentos);
        expect(despues.citas).toEqual(antes.citas.map(c => c.id === m.cita.id && ganaMovimiento ? { ...c, version: 2,
          inicioUtc: new Date('2026-11-09T14:00:00Z'), finUtc: new Date('2026-11-09T14:30:00Z'), finOcupacionUtc: new Date('2026-11-09T14:40:00Z') } : c));
        expect(despues.citas.filter(c => c.folio === m.cita.folio)).toHaveLength(1);
        expect(despues.eventos.filter(e => antes.eventos.some(previo => previo.id === e.id))).toEqual(antes.eventos);
        expect(despues.eventos.length).toBe(antes.eventos.length + Number(ganaMovimiento));
        if (ganaMovimiento) expect(despues.eventos.at(-1)).toMatchObject({ accion: 'cambio_horario', actorUsuarioId: m.actor.id,
          ocurridoEn: f.reloj.ahora(), versionResultante: 2, valoresAntes: { inicioUtc: m.cita.inicioUtc }, valoresDespues: { inicioUtc: '2026-11-09T14:00:00.000Z' } });
        const operacion = await f.db.getRepository(OperacionApartado).findOneByOrFail({ clave });
        expect(operacion.estado).toBe(ganaMovimiento ? 'rechazada' : 'concedida');
        expect(operacion.apartadoId).toBe(ganaMovimiento ? null : apartado.body.apartadoId);
        const apartadosDespues = await f.db.getRepository(BloqueoTemporal).find({ order: { id: 'ASC' } });
        expect(apartadosDespues.filter(a => apartadosAntes.some(previo => previo.id === a.id))).toEqual(apartadosAntes);
        expect(apartadosDespues.length).toBe(apartadosAntes.length + Number(!ganaMovimiento));
        if (!ganaMovimiento) expect(apartadosDespues.at(-1)).toMatchObject({ id: apartado.body.apartadoId, sucursalId, personalId: s.personalId,
          liberadoEn: null, separacionMinutos: 10, expiraEn: new Date(f.reloj.ahora().getTime() + 300000) });
        // La consulta real entre sedes confirma filas finales, no solamente respuestas HTTP resueltas.
        const ocupaciones = await f.db.transaction('READ COMMITTED', manager => f.app.get(OcupacionesService).consultar({ manager,
          negocioId: f.negocios[0].id, personalId: s.personalId, ahora: f.reloj.ahora() }, new Date('2026-11-09T14:00:00Z'), new Date('2026-11-09T14:40:00Z')));
        expect(ocupaciones).toHaveLength(1); expect(ocupaciones[0]).toMatchObject({ tipo: ganaMovimiento ? 'cita' : 'apartado', id: ganaMovimiento ? m.cita.id : apartado.body.apartadoId });
      } finally {
        abrir(); await Promise.allSettled([a, b].filter(p => p !== undefined));
        for (const espia of espias) espia.mockRestore(); for (const traza of trazas) traza.mockRestore();
        await otraApp.close();
      }
    });
  });
});
