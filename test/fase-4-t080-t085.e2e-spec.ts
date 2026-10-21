import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { RELOJ } from '../src/comun/reloj';
import { ResolucionReservaPublicaService } from '../src/reservas-publicas/resolucion-reserva-publica.service';
import { instalarLimiteCuerpoPublico } from '../src/reservas-publicas/limite-cuerpo-publico';
import { MetricasPortalService } from '../src/reservas-publicas/metricas-portal.service';
import { conBaseMigrada } from './support/mariadb';
import { crearEscenarioPortal } from './support/escenario-portal';
import { RelojPrueba } from './support/reloj';

const ORIGEN = 'https://citas.example.test';
const RUTA = '/publico/negocios/portal-prueba-1';
const CONTACTO = { nombre: '  María Pérez  ', telefono: '+52 614-123-4567', notas: 'Primera visita' };

/** Cada caso recorre HTTP y servicios reales sobre una base migrada desechable. */
async function conPortal(ejecutar: (f: Awaited<ReturnType<typeof iniciarFlujo>>) => Promise<void>) {
  await conBaseMigrada(async (db) => {
    const reloj = new RelojPrueba(new Date('2026-10-20T12:00:00Z'));
    const { negocios: [a, b] } = await crearEscenarioPortal(db, reloj);
    for (const negocio of [a, b]) {
      await db.query(`INSERT INTO licencias (negocio_id,creado_en,habilitada_en,vence_en)
        VALUES (?,'2026-01-01','2026-01-01','2027-01-01')`, [negocio.id]);
    }
    await db.query(`INSERT INTO horarios_personal (negocio_id,personal_id,sucursal_id,
      dia_semana,orden,inicio_minutos,fin_minutos,activo) VALUES (?,?,?,2,0,480,720,1)`,
    [a.id, a.profesionales[0], a.sucursales[0].id]);
    const servicioId = Number((await db.query('SELECT id FROM servicios WHERE negocio_id=? AND activo=1', [a.id]))[0].id);
    const cambios = { PORTAL_PUBLICO_ORIGEN: ORIGEN,
      PORTAL_CSRF_SECRET: 'secreto-csrf-prueba-http-1234567890123456',
      PORTAL_FORMULARIO_HMAC_SECRET: 'secreto-formulario-prueba-http-1234567890123456' };
    const anteriores = Object.fromEntries(Object.keys(cambios).map((k) => [k, process.env[k]]));
    Object.assign(process.env, cambios);
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DataSource).useValue(db).overrideProvider(RELOJ).useValue(reloj).compile();
    const app = modulo.createNestApplication();
    try {
      // Reproduce el bootstrap de main: el límite actúa antes del controlador.
      instalarLimiteCuerpoPublico(app);
      await app.init();
      await ejecutar(await iniciarFlujo(app, db, reloj, a.id, servicioId,
        a.profesionales[0], a.sucursales[0].id));
    } finally {
      await app.close();
      for (const [k, valor] of Object.entries(anteriores)) {
        if (valor === undefined) delete process.env[k]; else process.env[k] = valor;
      }
    }
  });
}

/** Las claves opacas identifican el envío también cuando la preparación se pierde. */
async function iniciarFlujo(app: import('@nestjs/common').INestApplication, db: DataSource,
  reloj: RelojPrueba, negocioId: number, servicioId: number, personalId: number, sucursalId: number) {
  const http = app.getHttpServer();
  const iniciar = async (ruta = RUTA) => {
    const r = await request(http).post(`${ruta}/sesion`).set('Origin', ORIGEN)
      .set('X-Portal-Inicializacion', '1').expect(201);
    return { cookie: r.headers['set-cookie'][0].split(';')[0], csrf: r.body.csrfToken as string };
  };
  const propia = await iniciar();
  const ajena = await iniciar();
  const post = (ruta: string, cuerpo: unknown, identidad = propia, base = RUTA) =>
    request(http).post(`${base}${ruta}`).set('Origin', ORIGEN)
      .set('Cookie', identidad.cookie).set('X-CSRF-Token', identidad.csrf).send(cuerpo);
  let secuencia = 0;
  const apartar = async (horaInicio = '08:00') => (await post('/apartados', {
    clave: `operacion_http_${++secuencia}_1234567890`, servicioId, personalId, sucursalId,
    fechaLocal: '2026-10-20', horaInicio }).expect(201)).body;
  const apartado = await apartar();
  const clave = 'intento_http_1234567890';
  const preparar = (id = clave, apartadoId = apartado.apartadoId, identidad = propia) =>
    post('/intentos', { clave: id, apartadoId }, identidad);
  const reservar = (contacto: unknown = CONTACTO, id = clave, identidad = propia) =>
    post(`/intentos/${id}/reservar`, contacto, identidad);
  const resolver = (id = clave, apartadoId = apartado.apartadoId, identidad = propia) =>
    post(`/intentos/${id}/resolver`, { apartadoId }, identidad);
  return { app, db, reloj, negocioId, servicioId, personalId, sucursalId, propia, ajena,
    http, iniciar, post, apartar, apartado, clave, preparar, reservar, resolver };
}

describe('M3-T080–T085: reserva y recuperación públicas reales', () => {
  it('M3-T126: el cierre detiene escrituras nuevas y conserva liberación y recuperación', async () => {
    await conPortal(async (f) => {
      const anterior = process.env.PORTAL_PUBLICO_ESCRITURAS;
      try {
        await f.preparar().expect(201);
        process.env.PORTAL_PUBLICO_ESCRITURAS = 'cerradas';
        await f.post('/apartados', { clave: 'operacion_cerrada_1234567890',
          servicioId: f.servicioId, personalId: f.personalId, sucursalId: f.sucursalId,
          fechaLocal: '2026-10-20', horaInicio: '09:00' }).expect(503);
        await f.reservar().expect(503);
        expect((await f.resolver().expect(200)).body).toEqual({ estado: 'no_registrado' });
        await f.post(`/apartados/${f.apartado.apartadoId}/liberar`, {
          generacion: f.apartado.generacion }).expect(204);
        expect(f.app.get(MetricasPortalService).consultar().fallo).toBeGreaterThanOrEqual(2);
        expect((await f.db.query("SELECT COUNT(*) AS n FROM citas WHERE origen='portal_publico'"))[0].n).toBe('0');
        process.env.PORTAL_PUBLICO_ESCRITURAS = 'habilitadas';
        const nuevo = await f.apartar('09:00');
        f.reloj.fijar(new Date(nuevo.expiraEn));
        const vencido = await request(f.http).get(`${RUTA}/apartados/${nuevo.apartadoId}`)
          .set('Cookie', f.propia.cookie).expect(200);
        expect(vencido.body.estado).toBe('vencido');
        expect(f.app.get(MetricasPortalService).consultar().expiracion).toBe(1);
      } finally {
        if (anterior === undefined) delete process.env.PORTAL_PUBLICO_ESCRITURAS;
        else process.env.PORTAL_PUBLICO_ESCRITURAS = anterior;
      }
    });
  }, 120000);

  it('M3-T126–T127: recupera una cita previa al cierre y cuenta recuperaciones', async () => {
    await conPortal(async (f) => {
      const anterior = process.env.PORTAL_PUBLICO_ESCRITURAS;
      try {
        await f.preparar().expect(201);
        const registrada = (await f.reservar().expect(201)).body;
        process.env.PORTAL_PUBLICO_ESCRITURAS = 'cerradas';
        expect((await f.reservar().expect(200)).body).toEqual(registrada);
        expect((await f.resolver().expect(200)).body.resultado).toEqual(registrada);
        expect(f.app.get(MetricasPortalService).consultar().recuperacion).toBe(2);
      } finally {
        if (anterior === undefined) delete process.env.PORTAL_PUBLICO_ESCRITURAS;
        else process.env.PORTAL_PUBLICO_ESCRITURAS = anterior;
      }
    });
  }, 120000);
  it('M3-T125: rechaza campos extra y exceso, y protege todas las respuestas personales', async () => {
    await conPortal(async (f) => {
      // Cada entrada pasa por su ruta HTTP real; los errores no reflejan datos enviados.
      const extra = { secretoPrivado: 'SQL titular_hash clave_super_secreta' };
      const solicitudes = [
        () => request(f.http).get(`${RUTA}/catalogo`).query(extra),
        () => request(f.http).get(`${RUTA}/disponibilidad`).query(extra),
        () => request(f.http).post(`${RUTA}/sesion`).set('Origin', ORIGEN)
          .set('X-Portal-Inicializacion', '1').send(extra),
        () => f.post('/apartados', { clave: 'operacion_extra_1234567890', ...extra }),
        () => f.post('/intentos', { clave: f.clave, apartadoId: f.apartado.apartadoId, ...extra }),
        () => f.post(`/intentos/${f.clave}/reservar`, { ...CONTACTO, ...extra }),
        () => f.post(`/intentos/${f.clave}/resolver`, { apartadoId: f.apartado.apartadoId, ...extra }),
        () => f.post(`/apartados/${f.apartado.apartadoId}/liberar`, {
          generacion: f.apartado.generacion, ...extra }),
      ];
      for (const [indice, solicitud] of solicitudes.entries()) {
        const respuesta = await solicitud();
        expect({ indice, estado: respuesta.status }).toEqual({ indice, estado: 400 });
        expect(respuesta.body).toMatchObject({ codigo: 'portal_400', accion: 'corregir' });
        expect(JSON.stringify(respuesta.body)).not.toMatch(/SQL|titular_hash|clave_super_secreta/);
        expect(respuesta.headers['cache-control']).toBe('no-store');
      }
      const consulta = await request(f.http).get(`${RUTA}/apartados/${f.apartado.apartadoId}`)
        .set('Cookie', f.propia.cookie).expect(200);
      expect(consulta.headers['cache-control']).toBe('no-store');
      const exceso = JSON.stringify({ nombre: 'Ana', telefono: '6141234567' }) +
        ' '.repeat(32 * 1024);
      const grande = await request(f.http).post(`${RUTA}/intentos/${f.clave}/reservar`)
        .set('Origin', ORIGEN).set('Cookie', f.propia.cookie)
        .set('X-CSRF-Token', f.propia.csrf).set('Content-Type', 'application/json')
        .send(exceso).expect(400);
      expect(grande.body).toMatchObject({ codigo: 'portal_400', accion: 'corregir' });
      expect(grande.headers['cache-control']).toBe('no-store');
    });
  }, 120000);
  it('crea y repite preparación/reserva; valida contacto y rechaza autoridad del navegador', async () => {
    await conPortal(async (f) => {
      const preparado = await f.preparar().expect(201);
      expect(preparado.body).toMatchObject({ id: f.clave, apartadoId: f.apartado.apartadoId, estado: 'preparado' });
      expect((await f.preparar().expect(200)).body).toEqual(preparado.body);
      for (const extra of [{ estado: 'confirmada' }, { costo: 1 }, { finUtc: '2026-10-20' }, { negocioId: 2 }, { titularHash: 'a' }]) {
        await f.reservar({ ...CONTACTO, ...extra }).expect(400);
      }
      await f.reservar({ ...CONTACTO, nombre: ' ' }).expect(400);
      await f.reservar({ ...CONTACTO, telefono: '+1 6141234567' }).expect(400);
      await f.reservar({ ...CONTACTO, notas: 'x'.repeat(2001) }).expect(400);
      const r = await f.reservar().expect(201);
      expect(r.body).toEqual({ folio: expect.any(String), estado: 'pendiente',
        costoAceptado: '100.00', nombreNegocio: 'Portal 1', nombreServicio: 'Corte',
        nombreSucursal: 'Sucursal 1-0', nombreProfesional: 'Profesional 1-1',
        zonaHoraria: 'America/Chihuahua', inicioUtc: '2026-10-20T14:00:00.000Z',
        finUtc: '2026-10-20T14:30:00.000Z' });
      expect(r.body.folio).toMatch(/^P-[A-F0-9]{18}$/);
      expect(r.headers['cache-control']).toBe('no-store');
      const persistido = (await f.db.query(`SELECT i.estado,i.cita_id,s.apartado_actual_id,
        b.liberado_en FROM intentos_reserva_publica i
        JOIN sesiones_reserva_publica s ON s.id=i.sesion_id AND s.negocio_id=i.negocio_id
        JOIN bloqueos_temporales b ON b.id=i.apartado_id AND b.negocio_id=i.negocio_id
        WHERE i.negocio_id=? AND i.clave=?`, [f.negocioId, f.clave]))[0];
      expect(persistido).toMatchObject({ estado: 'registrado', apartado_actual_id: null });
      expect(persistido.cita_id).not.toBeNull();
      expect(persistido.liberado_en).not.toBeNull();
      expect((await f.reservar({ nombre: 'María Pérez', telefono: '6141234567', notas: 'Primera visita' }).expect(200)).body).toEqual(r.body);
      await f.reservar({ ...CONTACTO, nombre: 'Otro' }).expect(409);
      expect((await f.resolver().expect(200)).body).toEqual({ estado: 'registrado', resultado: r.body });
      expect((await f.db.query("SELECT COUNT(*) AS n FROM citas WHERE origen='portal_publico'"))[0].n).toBe('1');
    });
  }, 120000);

  it('conserva dos contactos con teléfono compartido y mantiene ocupada la cita pendiente', async () => {
    await conPortal(async (f) => {
      await f.preparar().expect(201);
      const primera = (await f.reservar().expect(201)).body;
      const siguiente = await f.apartar('09:00');
      const otra = 'intento_otro_1234567890';
      await f.preparar(otra, siguiente.apartadoId).expect(201);
      const segunda = (await f.reservar({ nombre: 'Luis Pérez', telefono: '6141234567', notas: '<b>Texto</b>' }, otra).expect(201)).body;
      expect(segunda.folio).not.toBe(primera.folio);
      const filas = await f.db.query(`SELECT c.*,cl.nombre_completo,cl.telefono FROM citas c
        JOIN clientes cl ON cl.id=c.cliente_id AND cl.negocio_id=c.negocio_id
        WHERE c.negocio_id=? AND c.origen='portal_publico' ORDER BY c.id`, [f.negocioId]);
      expect(filas).toHaveLength(2);
      expect(filas[0]).toMatchObject({ nombre_contacto: 'María Pérez', nombre_completo: 'María Pérez', telefono: '6141234567', estado: 'pendiente' });
      expect(filas[1]).toMatchObject({ nombre_contacto: 'Luis Pérez', nombre_completo: 'Luis Pérez', telefono: '6141234567', motivo_consulta: '<b>Texto</b>', estado: 'pendiente' });
      expect(filas[0].cliente_id).not.toBe(filas[1].cliente_id);
      f.reloj.fijar(new Date('2026-10-20T12:06:00Z'));
      const disponibilidad = await request(f.http).get(`${RUTA}/disponibilidad`).query({
        personalId: f.personalId, sucursalId: f.sucursalId, servicioId: f.servicioId,
        desde: '2026-10-20', hasta: '2026-10-20' }).expect(200);
      // Hay otros horarios: la ausencia del ocupado no puede pasar por agenda vacía.
      expect(disponibilidad.body.ranuras.length).toBeGreaterThan(0);
      expect(disponibilidad.body.ranuras.map((r: { inicioUtc: string }) => r.inicioUtc))
        .not.toContain(primera.inicioUtc);
      const ocupado = await f.post('/apartados', { clave: 'operacion_ocupada_1234567890',
        personalId: f.personalId, sucursalId: f.sucursalId, servicioId: f.servicioId,
        fechaLocal: '2026-10-20', horaInicio: '08:00' }, f.ajena);
      expect(ocupado.status).toBe(409);
      expect((await f.db.query("SELECT estado FROM citas WHERE folio=?", [primera.folio]))[0].estado).toBe('pendiente');
    });
  }, 120000);

  it('respeta costo aceptado y recupera historia tras editar catálogo y cerrar licencia', async () => {
    await conPortal(async (f) => {
      await f.preparar().expect(201);
      await f.db.query('UPDATE servicios SET costo=250 WHERE id=?', [f.servicioId]);
      const original = (await f.reservar().expect(201)).body;
      expect(original.costoAceptado).toBe('100.00');
      expect((await f.apartar('09:00')).costoAceptado).toBe('250.00');
      await f.db.query("UPDATE negocios SET nombre='Nuevo' WHERE id=?", [f.negocioId]);
      await f.db.query("UPDATE servicios SET nombre='Nuevo',duracion_minutos=60,costo=999 WHERE id=?", [f.servicioId]);
      await f.db.query("UPDATE sucursales SET nombre='Nueva',zona_horaria='UTC' WHERE id=?", [f.sucursalId]);
      await f.db.query("UPDATE usuarios SET nombre='Nuevo' WHERE id=?", [f.personalId]);
      await f.db.query('UPDATE licencias SET vence_en=? WHERE negocio_id=?', [f.reloj.ahora(), f.negocioId]);
      expect((await f.resolver().expect(200)).body).toEqual({ estado: 'registrado', resultado: original });
      expect((await f.reservar().expect(200)).body).toEqual(original);
      const cita = (await f.db.query('SELECT nombre_contacto,telefono_contacto,motivo_consulta FROM citas WHERE folio=?', [original.folio]))[0];
      expect(cita).toEqual({ nombre_contacto: 'María Pérez', telefono_contacto: '6141234567', motivo_consulta: 'Primera visita' });
    });
  }, 120000);

  it.each(['oferta', 'duracion', 'vencimiento', 'licencia', 'liberado'])(
    'rechaza %s sin consumir apartado ni escribir filas parciales', async (cambio) => {
      await conPortal(async (f) => {
        await f.preparar().expect(201);
        if (cambio === 'oferta') await f.db.query('UPDATE servicios SET activo=0 WHERE id=?', [f.servicioId]);
        if (cambio === 'duracion') await f.db.query('UPDATE servicios SET duracion_minutos=45 WHERE id=?', [f.servicioId]);
        if (cambio === 'vencimiento') f.reloj.fijar(new Date(f.apartado.expiraEn));
        if (cambio === 'licencia') await f.db.query('UPDATE licencias SET vence_en=? WHERE negocio_id=?', [f.reloj.ahora(), f.negocioId]);
        if (cambio === 'liberado') await f.post(`/apartados/${f.apartado.apartadoId}/liberar`, { generacion: f.apartado.generacion }).expect(204);
        const r = await f.reservar();
        expect([404, 409]).toContain(r.status);
        expect((await f.db.query("SELECT COUNT(*) AS n FROM citas WHERE origen='portal_publico'"))[0].n).toBe('0');
        expect((await f.db.query('SELECT COUNT(*) AS n FROM clientes WHERE negocio_id=?', [f.negocioId]))[0].n).toBe('1');
        const apartado = (await f.db.query('SELECT liberado_en,expira_en FROM bloqueos_temporales WHERE id=?', [f.apartado.apartadoId]))[0];
        if (cambio !== 'liberado') expect(apartado.liberado_en).toBeNull();
        expect(apartado.expira_en.toISOString()).toBe(f.apartado.expiraEn);
      });
    }, 120000);

  it('aísla sesión y negocio, exige origen/CSRF y no permite búsquedas por teléfono o folio', async () => {
    await conPortal(async (f) => {
      await f.preparar().expect(201);
      await f.reservar(CONTACTO, f.clave, f.ajena).expect(404);
      await f.preparar('intento_ajeno_1234567890', f.apartado.apartadoId, f.ajena).expect(404);
      await f.resolver(f.clave, f.apartado.apartadoId, f.ajena).expect(404);
      const otra = await f.iniciar('/publico/negocios/portal-prueba-2');
      await f.post(`/intentos/${f.clave}/resolver`, { apartadoId: f.apartado.apartadoId }, otra, '/publico/negocios/portal-prueba-2').expect(404);
      await f.post(`/intentos/${f.clave}/reservar`, CONTACTO, otra, '/publico/negocios/portal-prueba-2').expect(404);
      for (const accion of ['reservar', 'resolver']) {
        await request(f.http).post(`${RUTA}/intentos/${f.clave}/${accion}`).send({}).expect(401);
        await request(f.http).post(`${RUTA}/intentos/${f.clave}/${accion}`)
          .set('Cookie', f.propia.cookie).set('Origin', ORIGEN).send({}).expect(403);
        await request(f.http).post(`${RUTA}/intentos/${f.clave}/${accion}`)
          .set('Cookie', f.propia.cookie).set('Origin', 'https://ajeno.test')
          .set('X-CSRF-Token', f.propia.csrf).send({}).expect(403);
      }
      await f.post('/intentos', { clave: f.clave, apartadoId: f.apartado.apartadoId, estado: 'registrado' }).expect(400);
      await f.post(`/intentos/${f.clave}/resolver`, { apartadoId: f.apartado.apartadoId, telefono: '6141234567' }).expect(400);
      await f.reservar(CONTACTO, 'invalida').expect(400);
      await f.reservar(CONTACTO, 'clave_inexistente_123456').expect(404);
      const r = await f.reservar().expect(201);
      // Una cookie sintácticamente inválida cuenta como credencial perdida.
      const perdida = await request(f.http).post(`${RUTA}/intentos/${f.clave}/resolver`)
        .set('Cookie', 'reserva_sesion=invalida').set('Origin', ORIGEN)
        .send({ apartadoId: f.apartado.apartadoId }).expect(401);
      expect(perdida.body).not.toHaveProperty('estado');
      expect(perdida.headers['cache-control']).toBe('no-store');
      expect((await f.resolver(f.clave, f.apartado.apartadoId, f.ajena).expect(404)).body)
        .not.toHaveProperty('resultado');
      await f.resolver('clave_inexistente_123456', f.apartado.apartadoId, f.ajena).expect(404);
      await request(f.http).get(`${RUTA}/intentos/${r.body.folio}`).expect(404);
      expect((await f.resolver().expect(200)).body.resultado).toEqual(r.body);
    });
  }, 120000);

  it('cierra durablemente una preparación perdida y bloquea escrituras tardías', async () => {
    await conPortal(async (f) => {
      expect((await f.resolver().expect(200)).body).toEqual({ estado: 'no_registrado' });
      await f.preparar().expect(409);
      await f.reservar().expect(409);
      expect((await f.resolver().expect(200)).body).toEqual({ estado: 'no_registrado' });
      expect((await f.db.query("SELECT COUNT(*) AS n FROM citas WHERE origen='portal_publico'"))[0].n).toBe('0');
    });
  }, 120000);

  it('preserva incertidumbre ante fallos técnicos y permite recuperar después', async () => {
    await conPortal(async (f) => {
      await f.preparar().expect(201);
      const original = (await f.reservar().expect(201)).body;
      const servicio = f.app.get(ResolucionReservaPublicaService);
      // El fallo se inyecta en la frontera técnica; el registro y recuperación son reales.
      for (const [error, estado] of [[Object.assign(new Error('SQL secreto'), { code: 'ETIMEDOUT' }), 503], [new Error('SQL secreto'), 500]] as const) {
        const espia = jest.spyOn(servicio, 'resolver').mockRejectedValueOnce(error);
        try {
          const r = await f.resolver().expect(estado);
          expect(r.body).toMatchObject({ codigo: `portal_${estado}`, accion: 'reintentar' });
          expect(r.body).not.toHaveProperty('estado');
          expect(JSON.stringify(r.body)).not.toContain('SQL');
          expect(r.headers['cache-control']).toBe('no-store');
        } finally { espia.mockRestore(); }
      }
      expect((await f.resolver().expect(200)).body).toEqual({ estado: 'registrado', resultado: original });
    });
  }, 120000);

  it('un fallo SQL al guardar devuelve 500 seguro, revierte y permite reintentar el mismo envío', async () => {
    await conPortal(async (f) => {
      await f.preparar().expect(201);
      // Falla después de insertar la cita: también debe revertirse el cliente nuevo.
      await f.db.query(`CREATE TRIGGER fallo_http AFTER INSERT ON citas
        FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='SQL secreto de prueba'`);
      try {
        const r = await f.reservar().expect(500);
        expect(r.body).toMatchObject({ codigo: 'portal_500', accion: 'reintentar' });
        expect(JSON.stringify(r.body)).not.toContain('SQL');
      } finally { await f.db.query('DROP TRIGGER fallo_http'); }
      expect((await f.db.query("SELECT COUNT(*) AS n FROM citas WHERE origen='portal_publico'"))[0].n).toBe('0');
      expect((await f.db.query('SELECT COUNT(*) AS n FROM clientes WHERE negocio_id=?', [f.negocioId]))[0].n).toBe('1');
      const previo = (await f.db.query('SELECT liberado_en,expira_en FROM bloqueos_temporales WHERE id=?', [f.apartado.apartadoId]))[0];
      expect(previo.liberado_en).toBeNull();
      expect(previo.expira_en.toISOString()).toBe(f.apartado.expiraEn);
      const resultado = (await f.reservar().expect(201)).body;
      expect((await f.resolver().expect(200)).body).toEqual({ estado: 'registrado', resultado });
    });
  }, 120000);
});
