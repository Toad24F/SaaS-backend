import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { Rol } from '../src/auth/enums/rol.enum';
import { Cita } from '../src/disponibilidad/entities/cita.entity';
import { IntentoCitaManual } from '../src/citas/entities/intento-cita-manual.entity';
import { RegistroCitaManualService } from '../src/citas/registro-cita-manual.service';
import { conAgendaHttp } from './support/agenda-http';

const ruta = '/citas/manuales/intentos';

describe('M4-T062: preparación, registro y resolución HTTP reales', () => {
  const previo = process.env.CITAS_MANUALES_HMAC_SECRET;
  beforeAll(() => { process.env.CITAS_MANUALES_HMAC_SECRET = 'secreto-estable-exclusivo-de-pruebas-manuales-http'; });
  afterAll(() => { if (previo === undefined) delete process.env.CITAS_MANUALES_HMAC_SECRET; else process.env.CITAS_MANUALES_HMAC_SECRET = previo; });

  it.each([Rol.ADMIN_NEGOCIO, Rol.RECEPCIONISTA])('%s crea, repite y recupera el mismo resultado sin confiar en claims', async (rol) => {
    await conAgendaHttp(async (f) => {
      const actor = f.actor(rol);
      const auth = `Bearer ${f.token(actor.id)}`;
      const cita = await f.db.getRepository(Cita).findOneByOrFail({ id: f.negocios[0].ocupaciones[0] });
      await f.db.query(`INSERT INTO horarios_personal
        (negocio_id,personal_id,dia_semana,orden,sucursal_id,inicio_minutos,fin_minutos,activo)
        VALUES(?,?,1,0,?,480,720,1)`, [cita.negocioId, cita.personalId, cita.sucursalId]);
      const seleccion = { clienteId: cita.clienteId, sucursalId: cita.sucursalId, personalId: cita.personalId,
        servicioId: cita.servicioId, fechaLocal: '2026-11-09', horaInicio: '09:17' };
      const clave = randomUUID();
      const preparar = () => request(f.http).post(ruta).set('Authorization', auth).send({ clave, seleccion });
      const p = await preparar().expect(201);
      expect(p.body.estado).toBe('preparado');
      expect((await preparar().expect(201)).body).toEqual(p.body);
      const creado = await request(f.http).post(`${ruta}/${clave}/registrar`).set('Authorization', auth).send(seleccion).expect(201);
      const repetido = await request(f.http).post(`${ruta}/${clave}/registrar`).set('Authorization', auth).send(seleccion).expect(200);
      expect(repetido.body).toEqual(creado.body);
      const resuelto = await request(f.http).post(`${ruta}/${clave}/resolver`).set('Authorization', auth).send(seleccion).expect(200);
      expect(resuelto.body).toEqual({ estado: 'registrado', resultado: creado.body });
      for (const r of [p, creado, repetido, resuelto]) expect(r.headers['cache-control']).toBe('no-store');
      expect(creado.body).toMatchObject({ estado: 'confirmada', origen: 'manual' });
      const intento = await f.db.getRepository(IntentoCitaManual).findOneByOrFail({ clave });
      expect(intento.actorUsuarioId).toBe(actor.id);
      expect(intento.negocioId).toBe(cita.negocioId);
      await request(f.http).post(`${ruta}/${clave}/registrar`).set('Authorization', auth).send({ ...seleccion, notas: 'Otro contenido' }).expect(409);
      // La clave no concede acceso a otra cuenta ni permite trasladar su resultado.
      const otraCuenta = `Bearer ${f.token(f.actor(rol === Rol.ADMIN_NEGOCIO ? Rol.RECEPCIONISTA : Rol.ADMIN_NEGOCIO).id)}`;
      await request(f.http).post(`${ruta}/${clave}/registrar`).set('Authorization', otraCuenta).send(seleccion).expect(404);
    });
  });

  it('cierra ausencia sin preparación y rechaza peticiones tardías, campos desconocidos y roles sin escritura', async () => {
    await conAgendaHttp(async (f) => {
      const auth = `Bearer ${f.token(f.actor(Rol.ADMIN_NEGOCIO).id)}`;
      const cita = await f.db.getRepository(Cita).findOneByOrFail({ id: f.negocios[0].ocupaciones[0] });
      const seleccion = { clienteId: cita.clienteId, sucursalId: cita.sucursalId, personalId: cita.personalId,
        servicioId: cita.servicioId, fechaLocal: '2026-11-09', horaInicio: '09:17' };
      const clave = randomUUID();
      const antes = await f.db.getRepository(Cita).count();
      for (let n = 0; n < 2; n++) {
        const r = await request(f.http).post(`${ruta}/${clave}/resolver`).set('Authorization', auth).send(seleccion).expect(200);
        expect(r.body).toEqual({ estado: 'no_registrado' });
      }
      await request(f.http).post(ruta).set('Authorization', auth).send({ clave, seleccion }).expect(409);
      await request(f.http).post(`${ruta}/${clave}/registrar`).set('Authorization', auth).send(seleccion).expect(409);
      await request(f.http).post(ruta).set('Authorization', auth).send({ clave: randomUUID(), seleccion, negocioId: 9 }).expect(400);
      await request(f.http).post(`${ruta}/${clave}/resolver`).set('Authorization', auth).send({ ...seleccion, precio: 1 }).expect(400);
      for (const sufijo of ['', `/${clave}/registrar`, `/${clave}/resolver`]) {
        const cuerpo = sufijo ? seleccion : { clave, seleccion };
        await request(f.http).post(`${ruta}${sufijo}`).send(cuerpo).expect(401);
        for (const rol of [Rol.PROFESIONAL, Rol.SUPERADMIN]) {
          const r = await request(f.http).post(`${ruta}${sufijo}`).set('Authorization', `Bearer ${f.token(f.actores.find((a) => a.rol === rol)!.id)}`).send(cuerpo).expect(403);
          expect(r.headers['cache-control']).toBe('no-store');
        }
      }
      expect(await f.db.getRepository(Cita).count()).toBe(antes);
    });
  });

  it('no convierte un fallo temporal ni inesperado en ausencia', async () => {
    await conAgendaHttp(async (f) => {
      const auth = `Bearer ${f.token(f.actor(Rol.ADMIN_NEGOCIO).id)}`;
      const seleccion = { clienteNuevo: { nombreCompleto: 'Persona', telefono: '6140000000' }, sucursalId: f.negocios[0].sucursales[0].id,
        personalId: f.negocios[0].profesionales[0], servicioId: 1, fechaLocal: '2026-11-09', horaInicio: '09:17' };
      const espia = jest.spyOn(f.app.get(RegistroCitaManualService), 'resolver').mockRejectedValueOnce(Object.assign(new Error('SQL secreto'), { code: 'ER_LOCK_WAIT_TIMEOUT' }))
        .mockRejectedValueOnce(new Error('SELECT secreto'));
      try {
        for (const codigo of [503, 500]) {
          const r = await request(f.http).post(`${ruta}/${randomUUID()}/resolver`).set('Authorization', auth).send(seleccion).expect(codigo);
          expect(r.headers['cache-control']).toBe('no-store');
          expect(JSON.stringify(r.body)).not.toMatch(/SQL|SELECT|secreto|stack/);
        }
      } finally { espia.mockRestore(); }
      expect(await f.db.getRepository(IntentoCitaManual).count()).toBe(0);
    });
  });
});
