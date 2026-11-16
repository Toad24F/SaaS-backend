import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { ApartadosService } from '../src/reservas-publicas/apartados.service';
import { IntentosReservaPublicaService } from '../src/reservas-publicas/intentos-reserva-publica.service';
import { RegistroReservaPublicaService } from '../src/reservas-publicas/registro-reserva-publica.service';
import { ResolucionReservaPublicaService } from '../src/reservas-publicas/resolucion-reserva-publica.service';
import { RegistroCitaManualService } from '../src/citas/registro-cita-manual.service';
import { IntentosCitaManualService } from '../src/citas/intentos-cita-manual.service';
import { BloqueoTemporal } from '../src/disponibilidad/entities/bloqueo-temporal.entity';
import { IntentoReservaPublica } from '../src/reservas-publicas/entities/intento-reserva-publica.entity';
import { conAgendaHttp } from './support/agenda-http';
import { prepararManual, filasManuales, type EscenarioManualHttp } from './support/cita-manual';
import { enfrentarEscritores } from './support/carrera-escritores-m4';

const contacto = { nombre: 'Persona pública independiente', telefono: '+52 614-123-4567', notas: 'Origen público' };
const basePublica = '/publico/negocios/portal-prueba-1';
const origen = 'https://carreras-m4.example.test';

/** Oferta deliberada en dos zonas: las comparaciones observan UTC y la separación conservada. */
async function escenario(f: EscenarioManualHttp, otra = false, horaPublica = '08:00') {
  const m = await prepararManual(f);
  const s = { ...m.seleccion, horaInicio: '08:00' };
  await f.db.query("UPDATE configuracion_agenda SET modo='ventana_libre',anticipacion_minutos=15,dias_futuros=60 WHERE negocio_id=?", [f.negocios[0].id]);
  const sucursalId = otra ? f.negocios[0].sucursales[1].id : s.sucursalId;
  if (otra) {
    await f.db.query("UPDATE sucursales SET zona_horaria='America/Tijuana' WHERE id=?", [sucursalId]);
    await f.db.query(`INSERT INTO horarios_personal
      (negocio_id,personal_id,dia_semana,orden,sucursal_id,inicio_minutos,fin_minutos,activo)
      VALUES(?,?,1,1,?,?,720,1)`, [f.negocios[0].id, s.personalId, sucursalId,
      Number(horaPublica.slice(0, 2)) * 60 + Number(horaPublica.slice(3))]);
  }
  const negocioId = f.negocios[0].id;
  const sesion = await request(f.http).post(`${basePublica}/sesion`).set('Origin', origen)
    .set('X-Portal-Inicializacion', '1').expect(201);
  const cookie = sesion.headers['set-cookie'][0].split(';')[0];
  const csrf = sesion.body.csrfToken;
  const [{ titular_hash: titular }] = await f.db.query('SELECT titular_hash FROM sesiones_reserva_publica WHERE negocio_id=?', [negocioId]);
  const clave = randomUUID();
  await f.app.get(IntentosCitaManualService).preparar(m.identidad, clave, s);
  const seleccion = { clave: randomUUID(), sucursalId, personalId: s.personalId, servicioId: s.servicioId,
    fechaLocal: s.fechaLocal, horaInicio: horaPublica };
  return { ...m, s, seleccion, titular, negocioId, clave, cookie, csrf };
}

/** Las carreras atraviesan guardas, cookies y CSRF reales y conservan la respuesta HTTP completa. */
type EscenarioCarrera = Awaited<ReturnType<typeof escenario>>;
function manualHttp(app: EscenarioManualHttp['app'], m: EscenarioCarrera) {
  return request(app.getHttpServer()).post(`/citas/manuales/intentos/${m.clave}/registrar`)
    .set('Authorization', m.auth).send(m.s).then(r => r);
}
function publicoHttp(app: EscenarioManualHttp['app'], m: EscenarioCarrera, ruta: string, cuerpo: unknown) {
  return request(app.getHttpServer()).post(`${basePublica}/${ruta}`).set('Origin', origen)
    .set('Cookie', m.cookie).set('X-CSRF-Token', m.csrf).send(cuerpo).then(r => r);
}

describe('M4-T110–T112 / M4-I001–I003: integración real pública/manual', () => {
  const entorno = { CITAS_MANUALES_HMAC_SECRET: 'secreto-carreras-reales-finales-manual-m4',
    PORTAL_PUBLICO_ORIGEN: origen, PORTAL_CSRF_SECRET: 'secreto-csrf-carreras-finales-m4-123456789',
    PORTAL_FORMULARIO_HMAC_SECRET: 'secreto-formulario-carreras-finales-m4-123456' };
  const previos = Object.fromEntries(Object.keys(entorno).map(k => [k, process.env[k]]));
  beforeAll(() => Object.assign(process.env, entorno));
  afterAll(() => { for (const [k, v] of Object.entries(previos)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });

  it.each(['manual', 'apartado'].flatMap(primero => [
    { relacion: 'igual', otra: false, hora: '08:00', conflicto: true },
    { relacion: 'parcial UTC', otra: true, hora: '06:20', conflicto: true },
    { relacion: 'separación histórica', otra: true, hora: '06:35', conflicto: true },
    { relacion: 'extremo contiguo', otra: true, hora: '06:40', conflicto: false },
  ].map(c => ({ primero, ...c }))))('T110/T111/I003 $primero primero: $relacion', async ({ primero, otra, hora, conflicto }) => {
    await conAgendaHttp(async f => {
      const m = await escenario(f, otra, hora);
      const antes = await filasManuales(f.db);
      const apartadosAntes = await f.db.getRepository(BloqueoTemporal).find();
      const manual = (app = f.app) => manualHttp(app, m);
      const apartado = (app = f.app) => publicoHttp(app, m, 'apartados', m.seleccion);
      const r = primero === 'manual' ? await enfrentarEscritores(f, () => manual(), app => apartado(app))
        : await enfrentarEscritores(f, () => apartado(), app => manual(app));
      const rm = primero === 'manual' ? r.primero : r.segundo;
      const ra = primero === 'apartado' ? r.primero : r.segundo;
      const ganaManual = !conflicto || primero === 'manual';
      expect(rm).toMatchObject({ status: 'fulfilled', value: { status: ganaManual ? 201 : 409 } });
      expect(ra).toMatchObject({ status: 'fulfilled', value: { status: conflicto && primero === 'manual' ? 409 : 201 } });
      for (const r of [rm, ra]) if (r.status === 'fulfilled') expect(r.value.headers['cache-control']).toBe('no-store');
      const despues = await filasManuales(f.db);
      expect(despues.citas.length - antes.citas.length).toBe(Number(ganaManual));
      expect(despues.clientes).toEqual(antes.clientes);
      expect(despues.eventos.length - antes.eventos.length).toBe(Number(ganaManual));
      expect(despues.intentos.find(i => i.clave === m.clave)).toMatchObject({ estado: ganaManual ? 'registrado' : 'preparado' });
      const nuevos = (await f.db.getRepository(BloqueoTemporal).find()).filter(a => !apartadosAntes.some(b => a.id === b.id));
      expect(nuevos).toHaveLength(Number(!conflicto || primero === 'apartado'));
      if (!conflicto) {
        const cita = despues.citas.at(-1)!;
        expect(cita.finOcupacionUtc).toEqual(nuevos[0].inicioUtc);
        expect(cita.separacionMinutos).toBe(10);
      }
      // La separación que ya adquirió el ganador permanece protegida aunque cambie la configuración.
      if (conflicto) {
        await f.db.query('UPDATE configuracion_agenda SET tiempo_entre_citas_minutos=0 WHERE negocio_id=?', [m.negocioId]);
        if (ganaManual) {
          // Otra operación fuerza una revalidación nueva; no basta repetir el rechazo idempotente anterior.
          expect((await f.app.get(ApartadosService).solicitar(m.negocioId, m.titular,
            { ...m.seleccion, clave: randomUUID() })).estado).toBe('rechazada');
        } else if (hora === '06:35') {
          expect(nuevos[0].separacionMinutos).toBe(10);
        }
      }
    });
  }, 120000);

  it.each(['manual', 'publico'])('I002/ALA-I002 último lugar telefónico: %s primero', async primero => {
    await conAgendaHttp(async f => {
      const m = await escenario(f, false, '09:20');
      const seed = { ...m.s, horaInicio: '11:00' }; const seedKey = randomUUID();
      await f.app.get(IntentosCitaManualService).preparar(m.identidad, seedKey, seed);
      await f.app.get(RegistroCitaManualService).registrar(m.identidad, seedKey, seed);
      const a = await f.app.get(ApartadosService).solicitar(m.negocioId, m.titular, m.seleccion);
      expect(a.estado).toBe('concedida'); const clavePublica = randomUUID();
      await f.app.get(IntentosReservaPublicaService).preparar(m.negocioId, m.titular, { clave: clavePublica, apartadoId: a.apartadoId });
      const antes = await filasManuales(f.db);
      const manual = (app = f.app) => manualHttp(app, m);
      const publico = (app = f.app) => publicoHttp(app, m, `intentos/${clavePublica}/reservar`, contacto);
      const r = primero === 'manual' ? await enfrentarEscritores(f, () => manual(), app => publico(app))
        : await enfrentarEscritores(f, () => publico(), app => manual(app));
      expect(r.primero).toMatchObject({ status: 'fulfilled', value: { status: 201 } });
      expect(r.segundo).toMatchObject({ status: 'fulfilled', value: { status: 409 } });
      const despues = await filasManuales(f.db);
      expect(despues.citas).toHaveLength(antes.citas.length + 1);
      expect(despues.eventos).toHaveLength(antes.eventos.length + 1);
      expect(despues.clientes).toHaveLength(antes.clientes.length + Number(primero === 'publico'));
      const nuevas = despues.citas.filter(c => c.inicioUtc > f.reloj.ahora() && c.sucursalId === m.s.sucursalId && c.telefonoContacto === '6141234567' && c.estado !== 'cancelada');
      expect(nuevas).toHaveLength(2);
      expect(despues.intentos.find(i => i.clave === m.clave)?.estado).toBe(primero === 'manual' ? 'registrado' : 'preparado');
      expect((await f.db.getRepository(IntentoReservaPublica).findOneByOrFail({ clave: clavePublica })).estado).toBe(primero === 'publico' ? 'registrado' : 'no_registrado');
    });
  }, 120000);

  it.each(['manual', 'publico'])('I003/ALA-I003 escritor público y manual: %s llega primero, se conserva el apartado protegido', async primero => {
    await conAgendaHttp(async f => {
      // El apartado de otra sede empieza a 14:35 UTC: solo invade la separación manual 14:30–14:40.
      const m = await escenario(f, true, '06:35');
      const a = await f.app.get(ApartadosService).solicitar(m.negocioId, m.titular, m.seleccion);
      expect(a.estado).toBe('concedida'); const clave = randomUUID();
      await f.app.get(IntentosReservaPublicaService).preparar(m.negocioId, m.titular, { clave, apartadoId: a.apartadoId });
      const antes = await filasManuales(f.db);
      const manual = (app = f.app) => manualHttp(app, m);
      const publico = (app = f.app) => publicoHttp(app, m, `intentos/${clave}/reservar`, contacto);
      const r = primero === 'manual' ? await enfrentarEscritores(f, () => manual(), app => publico(app))
        : await enfrentarEscritores(f, () => publico(), app => manual(app));
      const rm = primero === 'manual' ? r.primero : r.segundo;
      const rp = primero === 'publico' ? r.primero : r.segundo;
      expect(rm).toMatchObject({ status: 'fulfilled', value: { status: 409 } });
      expect(rp).toMatchObject({ status: 'fulfilled', value: { status: 201, body: { estado: 'pendiente', inicioUtc: '2026-11-09T14:35:00.000Z' } } });
      const despues = await filasManuales(f.db);
      expect(despues.citas).toHaveLength(antes.citas.length + 1);
      expect(despues.clientes).toHaveLength(antes.clientes.length + 1);
      expect(despues.eventos).toHaveLength(antes.eventos.length + 1);
      expect(despues.citas.at(-1)).toMatchObject({ origen: 'portal_publico', estado: 'pendiente', separacionMinutos: 10,
        inicioUtc: new Date('2026-11-09T14:35:00Z'), finOcupacionUtc: new Date('2026-11-09T15:15:00Z') });
      expect(despues.intentos.find(i => i.clave === m.clave)).toMatchObject({ estado: 'preparado', citaId: null });
      expect((await f.db.getRepository(IntentoReservaPublica).findOneByOrFail({ clave })).estado).toBe('registrado');
      expect((await f.db.getRepository(BloqueoTemporal).findOneByOrFail({ id: a.apartadoId! })).liberadoEn).not.toBeNull();
    });
  }, 120000);

  it('I001/ALA-I001 cupo compartido y otra sucursal; I003/ALA-I003 reserva pública real con separación histórica', async () => {
    await conAgendaHttp(async f => {
      const m = await escenario(f, true, '07:00');
      const a = await f.app.get(ApartadosService).solicitar(m.negocioId, m.titular, m.seleccion);
      expect(a.estado).toBe('concedida'); const clave = randomUUID();
      await f.app.get(IntentosReservaPublicaService).preparar(m.negocioId, m.titular, { clave, apartadoId: a.apartadoId });
      const publico = await f.app.get(RegistroReservaPublicaService).registrar(m.negocioId, m.titular, clave, contacto);
      expect(publico.estado).toBe('pendiente');
      // La cita pública 15:00–15:40 UTC conserva separación al volver la configuración a cero.
      await f.db.query('UPDATE configuracion_agenda SET tiempo_entre_citas_minutos=0 WHERE negocio_id=?', [m.negocioId]);
      const registrar = async (horaInicio: string, sucursalId = m.s.sucursalId) => {
        const seleccion = { ...m.s, horaInicio, sucursalId }; const k = randomUUID();
        await f.app.get(IntentosCitaManualService).preparar(m.identidad, k, seleccion);
        return f.app.get(RegistroCitaManualService).registrar(m.identidad, k, seleccion);
      };
      await expect(registrar('09:35')).rejects.toMatchObject({ status: 409 });
      await registrar('09:40');
      await registrar('10:20');
      const antes = await filasManuales(f.db);
      await expect(registrar('11:00')).rejects.toMatchObject({ status: 409 });
      expect((await filasManuales(f.db)).citas).toEqual(antes.citas);
      // La segunda cita de la otra sede (la primera es pública) ocupa el último lugar compartido.
      await registrar('09:00', m.seleccion.sucursalId);
      await expect(registrar('09:40', m.seleccion.sucursalId)).rejects.toMatchObject({ status: 409 });
      const conocido = await filasManuales(f.db);
      expect(await f.app.get(ResolucionReservaPublicaService).resolver(m.negocioId, m.titular, clave, a.apartadoId!))
        .toEqual({ estado: 'registrado', resultado: publico });
      expect(await f.app.get(RegistroReservaPublicaService).registrar(m.negocioId, m.titular, clave, contacto)).toEqual(publico);
      expect(await filasManuales(f.db)).toEqual(conocido);
      expect((await f.db.getRepository(BloqueoTemporal).findOneByOrFail({ id: a.apartadoId! })).liberadoEn).not.toBeNull();
    });
  }, 120000);
});
