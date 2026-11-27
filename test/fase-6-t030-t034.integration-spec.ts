import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { Rol } from '../src/auth/enums/rol.enum';
import { Cita } from '../src/disponibilidad/entities/cita.entity';
import { conAgendaHttp } from './support/agenda-http';
import { filasManuales, prepararManual, RUTA_MANUAL } from './support/cita-manual';

async function registrarPropia(f: Parameters<Parameters<typeof conAgendaHttp>[0]>[0], auth: string,
  seleccion: Record<string, unknown>) {
  const clave = randomUUID();
  await request(f.http).post(RUTA_MANUAL).set('Authorization', auth).send({ clave, seleccion }).expect(201);
  return (await request(f.http).post(`${RUTA_MANUAL}/${clave}/registrar`).set('Authorization', auth)
    .send(seleccion).expect(201)).body;
}

// Cada petición usa JWT real y una base MariaDB desechable con dos negocios y dos profesionales.
describe('M5-T030–T034: escrituras propias del Profesional', () => {
  const secretoAnterior = process.env.CITAS_MANUALES_HMAC_SECRET;
  beforeAll(() => { process.env.CITAS_MANUALES_HMAC_SECRET = 'secreto-aislado-profesional-fase-seis-2026'; });
  afterAll(() => {
    if (secretoAnterior === undefined) delete process.env.CITAS_MANUALES_HMAC_SECRET;
    else process.env.CITAS_MANUALES_HMAC_SECRET = secretoAnterior;
  });
  it('permite crear con contacto capturado y deniega directorio, ficha arbitraria y otro perfil', async () => {
    await conAgendaHttp(async f => {
      const m = await prepararManual(f, Rol.PROFESIONAL);
      const entrada = { clave: randomUUID(), seleccion: m.nueva };
      await request(f.http).get('/clientes').set('Authorization', m.auth).expect(403);
      await request(f.http).post(RUTA_MANUAL).set('Authorization', m.auth)
        .send({ ...entrada, seleccion: m.seleccion }).expect(403);
      await request(f.http).post(RUTA_MANUAL).set('Authorization', m.auth)
        .send({ ...entrada, seleccion: { ...m.nueva, personalId: f.negocios[0].profesionales[1] } }).expect(404);
      await request(f.http).post(RUTA_MANUAL).set('Authorization', m.auth).send(entrada).expect(201);
      const creada = await request(f.http).post(`${RUTA_MANUAL}/${entrada.clave}/registrar`).set('Authorization', m.auth)
        .send(entrada.seleccion).expect(201);
      expect(creada.body).toMatchObject({ personalId: m.actor.id, origen: 'manual', estado: 'confirmada' });
      expect((await f.db.getRepository(Cita).findOneByOrFail({ id: creada.body.id })).nombreContacto)
        .toBe(m.nueva.clienteNuevo.nombreCompleto);
    });
  });

  it('rechaza citas ajenas, otro negocio y sesión revocada sin escribir filas', async () => {
    await conAgendaHttp(async f => {
      const m = await prepararManual(f, Rol.PROFESIONAL);
      const propia = f.negocios[0].ocupaciones[0];
      const [{ id: ajenaId }] = await f.db.query("SELECT id FROM citas WHERE negocio_id=? AND nombre_contacto='Paciente ajeno'", [f.negocios[0].id]);
      const ajena = await f.db.getRepository(Cita).findOneByOrFail({ id: ajenaId });
      const antes = await filasManuales(f.db);
      await request(f.http).patch(`/citas/${ajena.id}/estado`).set('Authorization', m.auth)
        .send({ estado: 'cancelada', version: ajena.version }).expect(404);
      await request(f.http).patch(`/citas/${ajena.id}/horario`).set('Authorization', m.auth)
        .send({ fechaLocal: '2026-11-09', horaInicio: '10:00', version: ajena.version }).expect(404);
      await request(f.http).patch(`/citas/${f.negocios[1].ocupaciones[0]}/estado`).set('Authorization', m.auth)
        .send({ estado: 'cancelada', version: 1 }).expect(404);
      expect(await filasManuales(f.db)).toEqual(antes);
      await f.db.query('UPDATE sesiones SET revocada_en=? WHERE id=?', [f.reloj.ahora(), m.actor.sesionId]);
      await request(f.http).patch(`/citas/${propia}/estado`).set('Authorization', m.auth)
        .send({ estado: 'cancelada', version: 1 }).expect(401);
    });
  });

  it('permite mover, cancelar y reactivar solo su cita; conserva su contacto histórico', async () => {
    await conAgendaHttp(async f => {
      const m = await prepararManual(f, Rol.PROFESIONAL);
      const creada = await registrarPropia(f, m.auth, m.nueva);
      // Una cita pendiente previa confirma al moverla; el contacto histórico persiste.
      await f.db.getRepository(Cita).update({ id: creada.id }, { estado: 'pendiente' });
      const movida = await request(f.http).patch(`/citas/${creada.id}/horario`).set('Authorization', m.auth)
        .send({ fechaLocal: '2026-11-09', horaInicio: '10:17', version: creada.version }).expect(200);
      expect(movida.body.estado).toBe('confirmada');
      const cancelada = await request(f.http).patch(`/citas/${creada.id}/estado`).set('Authorization', m.auth)
        .send({ estado: 'cancelada', version: movida.body.version }).expect(200);
      const reactivada = await request(f.http).patch(`/citas/${creada.id}/estado`).set('Authorization', m.auth)
        .send({ estado: 'confirmada', version: cancelada.body.version }).expect(200);
      expect(reactivada.body.estado).toBe('confirmada');
      expect((await f.db.getRepository(Cita).findOneByOrFail({ id: creada.id })).nombreContacto)
        .toBe(m.nueva.clienteNuevo.nombreCompleto);
    });
  });

  it('rechaza resultado prematuro, empalme y licencia vencida sin cambios parciales', async () => {
    await conAgendaHttp(async f => {
      const m = await prepararManual(f, Rol.PROFESIONAL);
      const primera = await registrarPropia(f, m.auth, m.nueva);
      const segunda = await registrarPropia(f, m.auth, { ...m.nueva, horaInicio: '10:17',
        clienteNuevo: { nombreCompleto: 'Otra persona', telefono: '6141234568' } });
      const antes = await filasManuales(f.db);
      await request(f.http).patch(`/citas/${primera.id}/estado`).set('Authorization', m.auth)
        .send({ estado: 'completada', version: primera.version }).expect(409);
      await request(f.http).patch(`/citas/${primera.id}/estado`).set('Authorization', m.auth)
        .send({ estado: 'no_asistio', version: primera.version }).expect(409);
      await request(f.http).patch(`/citas/${segunda.id}/horario`).set('Authorization', m.auth)
        .send({ fechaLocal: '2026-11-09', horaInicio: '09:17', version: segunda.version }).expect(409);
      expect(await filasManuales(f.db)).toEqual(antes);
      await f.db.query('UPDATE licencias SET vence_en=? WHERE negocio_id=?', [f.reloj.ahora(), f.negocios[0].id]);
      await request(f.http).patch(`/citas/${primera.id}/estado`).set('Authorization', m.auth)
        .send({ estado: 'cancelada', version: primera.version }).expect(401);
      expect(await filasManuales(f.db)).toEqual(antes);
    });
  });
});
