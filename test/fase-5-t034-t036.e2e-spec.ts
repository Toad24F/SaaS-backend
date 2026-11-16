import request from 'supertest';
import { QueryFailedError } from 'typeorm';
import { Rol } from '../src/auth/enums/rol.enum';
import { Cita } from '../src/disponibilidad/entities/cita.entity';
import { Sesion } from '../src/auth/entities/sesion.entity';
import { conAgendaHttp } from './support/agenda-http';

const rango = { desde: '2025-12-31', hasta: '2026-01-30' };
const secreto = 'SELECT telefonoContacto 6149999999 password stack secreto';

describe('M4-T034–T036: rutas privadas reales de agenda', () => {
  it('T034 protege las tres rutas, responde no-store y reconstruye roles/negocios actuales', async () => {
    await conAgendaHttp(async (f) => {
      for (const u of f.actores) {
        const auth = `Bearer ${f.token(u.id)}`;
        const listado = await request(f.http).get('/citas').query(rango).set('Authorization', auth).expect(u.rol === Rol.SUPERADMIN ? 403 : 200);
        expect(listado.headers['cache-control']).toBe('no-store');
        if (u.rol === Rol.SUPERADMIN) continue;
        expect(listado.body.citas.every((c: Cita) => c.negocioId === u.negocioId && (u.rol !== Rol.PROFESIONAL || c.personalId === u.id))).toBe(true);
        // Un perfil sin citas obtiene lista vacía; no puede abrir las de sus compañeros.
        if (!listado.body.citas.length) {
          for (const sufijo of ['', '/historial']) await request(f.http).get(`/citas/${f.negocios[1].ocupaciones[0]}${sufijo}`).set('Authorization', auth).expect(404);
          continue;
        }
        const id = listado.body.citas[0].id;
        for (const url of [`/citas/${id}`, `/citas/${id}/historial`]) {
          const respuesta = await request(f.http).get(url).set('Authorization', auth).expect(200);
          expect(respuesta.headers['cache-control']).toBe('no-store');
        }
      }
      for (const url of ['/citas', '/citas/1', '/citas/1/historial']) {
        const anonima = await request(f.http).get(url).expect(401);
        expect(anonima.headers['cache-control']).toBe('no-store');
        const root = await request(f.http).get(url).query(url === '/citas' ? rango : {})
          .set('Authorization', `Bearer ${f.token(f.superadmin.id)}`).expect(403);
        expect(root.headers['cache-control']).toBe('no-store');
      }
      const u = f.actor(Rol.ADMIN_NEGOCIO);
      await f.db.getRepository(Sesion).update(u.sesionId, { revocadaEn: f.reloj.ahora() });
      await request(f.http).get('/citas').query(rango).set('Authorization', `Bearer ${f.token(u.id)}`).expect(401);
    });
  });

  it('T034 rechaza entradas inválidas y devuelve igual 404 para IDs ajenos/ausentes sin rutas públicas', async () => {
    await conAgendaHttp(async (f) => {
      const auth = `Bearer ${f.token(f.actor(Rol.PROFESIONAL).id)}`;
      for (const url of ['/citas/0', '/citas/01', '/citas/1?negocioId=2', '/citas/1/historial?limite=101', '/citas?desde=2026-01-01&hasta=2026-02-12']) {
        expect((await request(f.http).get(url).set('Authorization', auth).expect(400)).headers['cache-control']).toBe('no-store');
      }
      for (const sufijo of ['', '/historial']) {
        const ajeno = await request(f.http).get(`/citas/${f.negocios[1].ocupaciones[0]}${sufijo}`).set('Authorization', auth).expect(404);
        const ausente = await request(f.http).get(`/citas/999999${sufijo}`).set('Authorization', auth).expect(404);
        expect(ajeno.body).toEqual(ausente.body);
      }
      await request(f.http).get('/publico/citas').expect(404);
      await request(f.http).post('/citas').set('Authorization', auth).send({}).expect(404);
    });
  });

  it('T035 reconstruye día, semana y mes con filtros, cinco estados y canceladas visibles', async () => {
    await conAgendaHttp(async (f) => {
      const u = f.actor(Rol.RECEPCIONISTA);
      const auth = `Bearer ${f.token(u.id)}`;
      const completa = await request(f.http).get('/citas').query(rango).set('Authorization', auth).expect(200);
      const ids = new Set(completa.body.citas.map((c: Cita) => c.id));
      expect(ids.size).toBe(6);
      for (const consulta of [{ desde: '2025-12-01', hasta: '2025-12-31' }, { desde: '2025-12-29', hasta: '2026-01-04' }, { desde: '2025-12-31', hasta: '2025-12-31' }]) {
        const r = await request(f.http).get('/citas').query(consulta).set('Authorization', auth).expect(200);
        expect(new Set(r.body.citas.map((c: Cita) => c.estado)).size).toBe(5);
      }
      const base = (await f.db.getRepository(Cita).findBy({ negocioId: u.negocioId! })).find((c) => c.estado === 'cancelada')!;
      const filtrada = await request(f.http).get('/citas').query({ ...rango, estado: 'cancelada', sucursalId: String(base.sucursalId),
        personalId: String(base.personalId), busqueda: 'Paciente propio' }).set('Authorization', auth).expect(200);
      expect(filtrada.body.citas.map((c: Cita) => c.id)).toEqual([base.id]);
    });
  });

  it('T035 coloca un mismo UTC en fechas distintas por su zona histórica y conserva ambas fechas al cruzar medianoche', async () => {
    await conAgendaHttp(async (f) => {
      const filas = await f.db.getRepository(Cita).findBy({ negocioId: f.negocios[0].id });
      for (const [i, zonaHorariaReserva] of ['America/Phoenix', 'America/Mexico_City'].entries()) await f.db.getRepository(Cita).update(filas[i].id,
        { inicioUtc: new Date('2026-02-01T06:45:00Z'), finUtc: new Date('2026-02-01T07:15:00Z'), finOcupacionUtc: null, zonaHorariaReserva });
      const auth = `Bearer ${f.token(f.actor(Rol.ADMIN_NEGOCIO).id)}`;
      const enero = await request(f.http).get('/citas').query({ desde: '2026-01-31', hasta: '2026-01-31' }).set('Authorization', auth).expect(200);
      expect(enero.body.citas).toHaveLength(1);
      expect(enero.body.citas[0]).toMatchObject({ id: filas[0].id, fechaLocal: '2026-01-31', fechaFinLocal: '2026-02-01', horaInicio: '23:45:00' });
      const febrero = await request(f.http).get('/citas').query({ desde: '2026-02-01', hasta: '2026-02-01' }).set('Authorization', auth).expect(200);
      expect(febrero.body.citas.map((c: Cita) => c.id)).toEqual([filas[1].id]);
    });
  });

  it('T036 diferencia lista e historial vacíos legítimos de ausencia de detalle', async () => {
    await conAgendaHttp(async (f) => {
      const auth = `Bearer ${f.token(f.actor(Rol.ADMIN_NEGOCIO).id)}`;
      const vacia = await request(f.http).get('/citas').query({ desde: '2026-05-01', hasta: '2026-05-01' }).set('Authorization', auth).expect(200);
      expect(vacia.body).toEqual({ desde: '2026-05-01', hasta: '2026-05-01', citas: [] });
      const historial = await request(f.http).get(`/citas/${f.negocios[0].ocupaciones[0]}/historial`).set('Authorization', auth).expect(200);
      expect(historial.body.eventos).toEqual([]);
      await request(f.http).get('/citas/999999').set('Authorization', auth).expect(404);
    });
  });

  it.each([['ER_LOCK_WAIT_TIMEOUT', 503], ['ER_PARSE_ERROR', 500]] as const)
    ('T036 informa %s sin SQL ni lista parcial cuando fallan las causas después de leer filas', async (code, estado) => {
      await conAgendaHttp(async (f) => {
        const auth = `Bearer ${f.token(f.actor(Rol.ADMIN_NEGOCIO).id)}`;
        const calcular = f.afectadas.causasParaCita.bind(f.afectadas);
        // La primera cita se proyecta bien; la segunda falla. No debe salir ni siquiera la primera.
        const espia = jest.spyOn(f.afectadas, 'causasParaCita').mockImplementationOnce(calcular)
          .mockRejectedValueOnce(new QueryFailedError(secreto, [secreto], Object.assign(new Error(secreto), { code })));
        try {
          const fallo = await request(f.http).get('/citas').query(rango).set('Authorization', auth).expect(estado);
          expect(fallo.body).not.toHaveProperty('citas');
          expect(JSON.stringify(fallo.body)).not.toMatch(/SELECT|6149999999|password|stack/);
          expect(fallo.headers['cache-control']).toBe('no-store');
          expect(espia).toHaveBeenCalledTimes(2);
        } finally { espia.mockRestore(); }
        await request(f.http).get('/citas').query(rango).set('Authorization', auth).expect(200);
      });
    });
});
