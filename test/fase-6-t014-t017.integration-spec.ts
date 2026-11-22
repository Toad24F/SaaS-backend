import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { Rol } from '../src/auth/enums/rol.enum';
import { conAgendaHttp } from './support/agenda-http';
import { filasManuales, prepararManual, RUTA_MANUAL, type EscenarioManualHttp } from './support/cita-manual';
import { enfrentarEscritores } from './support/carrera-escritores-m4';
import { normalizarNombreCliente } from '../src/clientes/identidad-cliente';

const origen = 'https://identidad-m5.example.test';
const portal = '/publico/negocios/portal-prueba-1';
const contacto = { nombreCompleto: 'María Peña', telefono: '6140000014' };
const equivalente = 'MARI\u0301A\u00a0  PEN\u0303A';
const publico = { nombre: equivalente, telefono: '+52 614-000-0014', notas: 'Nota pública sintética' };
const entorno = {
  CITAS_MANUALES_HMAC_SECRET: 'secreto-test-identidad-manual-modulo-cinco',
  PORTAL_CSRF_SECRET: 'secreto-test-identidad-csrf-modulo-cinco',
  PORTAL_FORMULARIO_HMAC_SECRET: 'secreto-test-identidad-formulario-modulo-cinco',
  PORTAL_PUBLICO_ORIGEN: origen,
};

function altaFicha(f: EscenarioManualHttp, negocioId: number, nombre = contacto.nombreCompleto) {
  return f.db.query('INSERT INTO clientes(negocio_id,nombre_completo,nombre_normalizado,telefono,email,version) VALUES (?,?,?,?,\'ficha@example.test\',3)',
    [negocioId, nombre, Buffer.from(normalizarNombreCliente(nombre)), contacto.telefono]);
}

async function prepararPublica(f: EscenarioManualHttp, seleccion: {
  servicioId: number; personalId: number; sucursalId: number; fechaLocal: string; horaInicio: string;
}) {
  await f.db.query("UPDATE configuracion_agenda SET modo='ventana_libre',anticipacion_minutos=15,dias_futuros=60 WHERE negocio_id=?", [f.negocios[0].id]);
  const sesion = await request(f.http).post(`${portal}/sesion`).set('Origin', origen)
    .set('X-Portal-Inicializacion', '1').expect(201);
  const post = (ruta: string, entrada: unknown, app = f.app) => request(app.getHttpServer()).post(`${portal}${ruta}`)
    .set('Origin', origen).set('Cookie', sesion.headers['set-cookie'][0].split(';')[0])
    .set('X-CSRF-Token', sesion.body.csrfToken).send(entrada);
  const { body: apartado } = await post('/apartados', { ...seleccion, clave: randomUUID() }).expect(201);
  const clave = randomUUID();
  await post('/intentos', { clave, apartadoId: apartado.apartadoId }).expect(201);
  return { clave, apartadoId: apartado.apartadoId,
    registrar: (datos = publico, app = f.app) => post(`/intentos/${clave}/reservar`, datos, app) };
}

function seleccionPublica(m: Awaited<ReturnType<typeof prepararManual>>, horaInicio = '08:40') {
  const { sucursalId, servicioId, personalId, fechaLocal } = m.seleccion;
  return { sucursalId, servicioId, personalId, fechaLocal, horaInicio };
}

function prepararRegistroManual(f: EscenarioManualHttp, auth: string, clave: string, seleccion: unknown) {
  return request(f.http).post(RUTA_MANUAL).set('Authorization', auth).send({ clave, seleccion });
}

function registrarManual(app: EscenarioManualHttp['app'], auth: string, clave: string, seleccion: unknown) {
  return request(app.getHttpServer()).post(`${RUTA_MANUAL}/${clave}/registrar`).set('Authorization', auth).send(seleccion);
}

async function filasPublicas(f: EscenarioManualHttp) {
  // Incluye los vínculos que se marcan al final del commit público.
  return { ...(await filasManuales(f.db)),
    apartados: await f.db.query('SELECT * FROM bloqueos_temporales ORDER BY id'),
    sesiones: await f.db.query('SELECT * FROM sesiones_reserva_publica ORDER BY id'),
    intentosPublicos: await f.db.query('SELECT * FROM intentos_reserva_publica ORDER BY id') };
}

describe('M5-T014–T017: identidad en los escritores reales y el directorio', () => {
  const anteriores = Object.fromEntries(Object.keys(entorno).map(k => [k, process.env[k]]));
  beforeAll(() => Object.assign(process.env, entorno));
  afterAll(() => {
    for (const [k, valor] of Object.entries(anteriores)) {
      if (valor === undefined) delete process.env[k]; else process.env[k] = valor;
    }
  });

  it('T014 reutiliza contacto manual sin sobrescribir la ficha y respeta otro ID elegido explícitamente', async () => {
    await conAgendaHttp(async f => {
      const m = await prepararManual(f);
      const { insertId: propia } = await altaFicha(f, f.negocios[0].id);
      const { insertId: otra } = await altaFicha(f, f.negocios[0].id, 'María Pena');
      await altaFicha(f, f.negocios[1].id);
      const antes = await filasManuales(f.db);
      const seleccion = { ...m.nueva, clienteNuevo: { nombreCompleto: equivalente, telefono: '+52 614-000-0014' } };
      const clave = randomUUID();
      await prepararRegistroManual(f, m.auth, clave, seleccion).expect(201);
      const r = await registrarManual(f.app, m.auth, clave, seleccion).expect(201);
      expect(r.body).toMatchObject({ clienteId: propia, estado: 'confirmada', nombreContacto: equivalente });
      expect((await registrarManual(f.app, m.auth, clave, seleccion).expect(200)).body).toEqual(r.body);

      const explicita = { ...m.seleccion, clienteId: otra, horaInicio: '10:00' };
      const segunda = randomUUID();
      await prepararRegistroManual(f, m.auth, segunda, explicita).expect(201);
      expect((await registrarManual(f.app, m.auth, segunda, explicita).expect(201)).body)
        .toMatchObject({ clienteId: otra, nombreContacto: 'María Pena' });
      const despues = await filasManuales(f.db);
      expect(despues.clientes).toEqual(antes.clientes);
      expect(despues.auditoria).toEqual(antes.auditoria);
      expect(despues.citas.find(c => c.id === r.body.id)?.clienteId).toBe(propia);
    });
  });

  it('T015 vincula la ficha pública propia sin publicar datos de la ficha o su historial', async () => {
    await conAgendaHttp(async f => {
      const m = await prepararManual(f);
      await altaFicha(f, f.negocios[1].id);
      const { insertId: propia } = await altaFicha(f, f.negocios[0].id);
      // La ficha propia sí tiene una cita histórica y la reserva debe conservarla.
      await f.db.query('UPDATE citas SET cliente_id=? WHERE id=? AND negocio_id=?',
        [propia, f.negocios[0].ocupaciones[0], f.negocios[0].id]);
      const p = await prepararPublica(f, seleccionPublica(m));
      const antes = await filasManuales(f.db);
      const r = await p.registrar().expect(201);
      expect(r.headers['cache-control']).toBe('no-store');
      expect(Object.keys(r.body).sort()).toEqual(['folio', 'estado', 'inicioUtc', 'finUtc', 'zonaHoraria',
        'costo', 'nombreNegocio', 'nombreServicio', 'nombreSucursal', 'nombreProfesional'].sort());
      expect((await p.registrar().expect(200)).body).toEqual(r.body);
      const despues = await filasManuales(f.db);
      expect(despues.citas.find(c => c.folio === r.body.folio))
        .toMatchObject({ clienteId: propia, nombreContacto: equivalente, telefonoContacto: contacto.telefono });
      expect(despues.clientes).toEqual(antes.clientes);
      expect(despues.citas).toHaveLength(antes.citas.length + 1);
      expect(despues.citas.filter(c => c.folio !== r.body.folio)).toEqual(antes.citas);
    });
  });

  it('T015 revierte alta, cita y apartado si falla la escritura del resultado, y admite reintento', async () => {
    await conAgendaHttp(async f => {
      const m = await prepararManual(f);
      const p = await prepararPublica(f, seleccionPublica(m));
      const antes = await filasPublicas(f);
      // Fallar el UPDATE final prueba la reversión después de escribir todas las filas anteriores.
      await f.db.query(`CREATE TRIGGER fallo_resultado_m5 BEFORE UPDATE ON intentos_reserva_publica
        FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='fallo controlado de prueba M5'`);
      try {
        const r = await p.registrar().expect(500);
        expect(r.body).toMatchObject({ codigo: 'portal_500' });
        expect(JSON.stringify(r.body)).not.toContain('fallo controlado');
        expect(await filasPublicas(f)).toEqual(antes);
      } finally {
        await f.db.query('DROP TRIGGER fallo_resultado_m5');
      }
      await p.registrar().expect(201);
      const despues = await filasPublicas(f);
      expect(despues.clientes).toHaveLength(antes.clientes.length + 1);
      expect(despues.citas).toHaveLength(antes.citas.length + 1);
    });
  });

  it('T014/T015 rechazan la identidad heredada ambigua sin seleccionar una ficha ni filtrar antecedentes', async () => {
    await conAgendaHttp(async f => {
      const m = await prepararManual(f);
      await f.db.query('ALTER TABLE clientes DROP INDEX uq_clientes_identidad_activa');
      await altaFicha(f, f.negocios[0].id);
      await altaFicha(f, f.negocios[0].id, equivalente);
      const p = await prepararPublica(f, seleccionPublica(m));
      const seleccion = { ...m.nueva, clienteNuevo: contacto };
      const clave = randomUUID();
      await prepararRegistroManual(f, m.auth, clave, seleccion).expect(201);
      const antes = await filasPublicas(f);
      await registrarManual(f.app, m.auth, clave, seleccion).expect(409);
      const r = await p.registrar().expect(409);
      expect(r.body).toEqual({ codigo: 'portal_409', mensaje: 'La selección cambió. Elija un horario vigente.', accion: 'volver' });
      expect(await filasPublicas(f)).toEqual(antes);
    });
  });

  it('T016 alta independiente idempotente y ficha fusionada fuera de las consultas y selección', async () => {
    await conAgendaHttp(async f => {
      const m = await prepararManual(f, Rol.RECEPCIONISTA);
      const alta = (datos: unknown, auth = m.auth) => request(f.http).post('/clientes').set('Authorization', auth).send(datos);
      const antes = await filasManuales(f.db);
      const { body: ficha } = await alta(contacto).expect(201);
      expect((await alta({ nombreCompleto: equivalente, telefono: '+52 614-000-0014' }).expect(200)).body).toEqual(ficha);
      const otraAuth = `Bearer ${f.token(f.actor(Rol.ADMIN_NEGOCIO, 1).id)}`;
      expect((await alta(contacto, otraAuth).expect(201)).body.id).not.toBe(ficha.id);
      const { body: distinta } = await alta({ ...contacto, nombreCompleto: 'María Pena' }).expect(201);
      await f.db.query('ALTER TABLE clientes DROP INDEX uq_clientes_identidad_activa');
      const { insertId: absorbida } = await altaFicha(f, f.negocios[0].id, equivalente);
      const clave = randomUUID();
      const seleccion = { ...m.seleccion, clienteId: absorbida };
      await prepararRegistroManual(f, m.auth, clave, seleccion).expect(201);
      // Sembrar el estado histórico permite verificar que un intento ya preparado también se vuelve a validar.
      await f.db.query('UPDATE clientes SET fusionado_en_id=? WHERE id=?', [ficha.id, absorbida]);
      await prepararRegistroManual(f, m.auth, randomUUID(), seleccion).expect(404);
      await registrarManual(f.app, m.auth, clave, seleccion).expect(404);
      for (const sufijo of ['', '/citas']) {
        await request(f.http).get(`/clientes/${absorbida}${sufijo}`).set('Authorization', m.auth).expect(404);
      }
      const r = await request(f.http).get('/clientes').query({ busqueda: contacto.telefono, limite: '2' })
        .set('Authorization', m.auth).expect(200);
      expect(r.body).toMatchObject({ hayMas: false });
      expect(r.body.clientes.map((c: { id: number }) => c.id).sort()).toEqual([ficha.id, distinta.id].sort());
      expect((await alta(contacto).expect(200)).body).toEqual(ficha);
      const despues = await filasManuales(f.db);
      expect(despues.auditoria).toHaveLength(antes.auditoria.length + 3);
      expect(despues.citas).toEqual(antes.citas);
    });
  });

  it.each(['manual', 'público'])('T017 dos escritores y distintos profesionales: %s confirma primero', async primero => {
    await conAgendaHttp(async f => {
      const m = await prepararManual(f);
      const seleccion = { ...m.nueva, horaInicio: '08:00', clienteNuevo: contacto };
      const [negocio] = f.negocios;
      const personal = negocio.profesionales[1];
      const { sucursalId, servicioId } = seleccion;
      await f.db.query('INSERT INTO personal_sucursales(negocio_id,personal_id,sucursal_id,activo) VALUES (?,?,?,1)', [negocio.id, personal, sucursalId]);
      await f.db.query('INSERT INTO personal_servicios_sucursales(negocio_id,personal_id,sucursal_id,servicio_id,activo) VALUES (?,?,?,?,1)',
        [negocio.id, personal, sucursalId, servicioId]);
      await f.db.query(`INSERT INTO horarios_personal (negocio_id,personal_id,dia_semana,orden,sucursal_id,inicio_minutos,fin_minutos,activo)
        VALUES(?,?,1,0,?,480,720,1)`, [negocio.id, personal, sucursalId]);
      const p = await prepararPublica(f, { ...seleccionPublica(m, '08:00'), personalId: personal });
      const clave = randomUUID();
      await prepararRegistroManual(f, m.auth, clave, seleccion).expect(201);
      const antes = await filasManuales(f.db);
      const manual = (app = f.app) => registrarManual(app, m.auth, clave, seleccion).then(r => r);
      const reserva = (app = f.app) => p.registrar(publico, app).then(r => r);
      // Los profesionales distintos hacen que la espera relevante sea la fila compartida de negocio.
      const orden = primero === 'manual' ? [manual, reserva] : [reserva, manual];
      const resultados = await enfrentarEscritores(f, orden[0], orden[1], {
        tablaEspera: 'negocios',
        comprobar: async app => {
          expect(await manual(app)).toMatchObject({ status: 200, body: { estado: 'confirmada' } });
          expect(await reserva(app)).toMatchObject({ status: 200, body: { estado: 'pendiente' } });
        },
      });
      expect(resultados.primero).toMatchObject({ status: 'fulfilled', value: { status: 201 } });
      expect(resultados.segundo).toMatchObject({ status: 'fulfilled', value: { status: 201 } });
      const despues = await filasManuales(f.db);
      const fichas = despues.clientes.filter(c => c.negocioId === negocio.id && c.telefono === contacto.telefono);
      expect(fichas).toHaveLength(1);
      expect(fichas[0]).toMatchObject({ fusionadoEnId: null, version: 1,
        nombreCompleto: primero === 'manual' ? contacto.nombreCompleto : equivalente,
        nombreNormalizado: Buffer.from('maría peña') });
      const nuevas = despues.citas.filter(c => !antes.citas.some(a => a.id === c.id));
      expect(nuevas).toHaveLength(2);
      expect(nuevas).toEqual(expect.arrayContaining([
        expect.objectContaining({ clienteId: fichas[0].id, origen: 'manual', estado: 'confirmada', nombreContacto: contacto.nombreCompleto }),
        expect.objectContaining({ clienteId: fichas[0].id, origen: 'portal_publico', estado: 'pendiente', nombreContacto: equivalente }),
      ]));
      expect(despues.eventos).toHaveLength(antes.eventos.length + 2);
      expect(await f.db.query('SELECT estado FROM intentos_reserva_publica WHERE clave=?', [p.clave])).toEqual([{ estado: 'registrado' }]);
      expect(despues.intentos.find(i => i.clave === clave)).toMatchObject({ estado: 'registrado' });
    });
  }, 120000);
});
