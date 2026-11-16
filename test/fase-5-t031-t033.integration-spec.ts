import { Cita } from '../src/disponibilidad/entities/cita.entity';
import { EventoCita } from '../src/citas/entities/evento-cita.entity';
import { Rol } from '../src/auth/enums/rol.enum';
import { conAgendaHttp } from './support/agenda-http';
import request from 'supertest';

describe('M4-T031–T033: causas, detalle e historial persistidos', () => {
  it('T031 recompone horario, bloqueo y oferta con el manager de la página sin mutar citas', async () => {
    await conAgendaHttp(async (f) => {
      const a = f.negocios[0];
      const id = a.ocupaciones[0];
      const actor = f.actor(Rol.ADMIN_NEGOCIO);
      const identidad = { sub: actor.id, sesionId: actor.sesionId };
      await f.db.getRepository(Cita).update(id, { inicioUtc: new Date('2026-11-08T14:00:00Z'),
        finUtc: new Date('2026-11-08T14:30:00Z'), finOcupacionUtc: new Date('2026-11-08T14:35:00Z'), separacionMinutos: 5 });
      const antes = await f.db.getRepository(Cita).findOneByOrFail({ id });
      await f.db.query('UPDATE servicios SET activo=0 WHERE id=?', [antes.servicioId]);
      const bloqueo = await f.db.query(`INSERT INTO bloqueos_horario
        (negocio_id,personal_id,sucursal_id,creador_usuario_id,tipo,motivo,fecha_inicio,fecha_fin,inicio_minutos,fin_minutos)
        VALUES(?,?,?,?,'emergencia','Prueba de causas','2026-11-08','2026-11-08',510,520)`,
      [a.id, antes.personalId, antes.sucursalId, actor.id]);
      const leer = () => f.agenda.listar(identidad, { desde: '2026-11-08', hasta: '2026-11-08' });
      expect((await leer()).citas[0].causas.map((c) => c.codigo)).toEqual(expect.arrayContaining(['horario_insuficiente', 'servicio_inactivo', 'bloqueo']));
      await f.db.query('DELETE FROM bloqueos_horario WHERE id=?', [bloqueo.insertId]);
      const sinBloqueo = (await leer()).citas[0].causas.map((c) => c.codigo);
      expect(sinBloqueo).not.toContain('bloqueo');
      expect(sinBloqueo).toEqual(expect.arrayContaining(['horario_insuficiente', 'servicio_inactivo']));
      await f.db.query('UPDATE servicios SET activo=1 WHERE id=?', [antes.servicioId]);
      // El horario cubre la atención y separación históricas, sin leer la configuración nueva.
      await f.db.query(`INSERT INTO horarios_personal(negocio_id,personal_id,sucursal_id,dia_semana,orden,inicio_minutos,fin_minutos,activo)
        VALUES(?,?,?,0,0,480,515,1)`, [a.id, antes.personalId, antes.sucursalId]);
      expect((await leer()).citas[0].causas).toEqual([]);
      expect(await f.db.getRepository(Cita).findOneByOrFail({ id })).toEqual(antes);
    });
  });

  it('T032 devuelve snapshot propio y 404 idéntico para cita ajena o ausente', async () => {
    await conAgendaHttp(async (f) => {
      const actor = f.actor(Rol.PROFESIONAL);
      const identidad = { sub: actor.id, sesionId: actor.sesionId };
      const id = f.negocios[0].ocupaciones[0];
      await f.db.getRepository(Cita).update(id, { costoAceptado: '123.45', nombreServicio: 'Servicio histórico', nombreContacto: 'Contacto histórico' });
      const original = await f.db.getRepository(Cita).findOneByOrFail({ id });
      await f.db.query("UPDATE servicios SET nombre='Catálogo nuevo',costo=999 WHERE id=?", [original.servicioId]);
      const detalle = await f.agenda.detalle(identidad, String(id), {});
      expect(detalle).toMatchObject({ id, estado: 'pendiente', origen: 'manual', costoAceptado: '123.45',
        nombreServicio: 'Servicio histórico', nombreContacto: 'Contacto histórico', motivoConsulta: 'Nota propia' });
      expect(detalle).not.toHaveProperty('apartadoOrigenId');
      for (const otro of [f.negocios[1].ocupaciones[0], 999999]) {
        await expect(f.agenda.detalle(identidad, String(otro), {})).rejects.toMatchObject({ status: 404, message: 'Recurso no disponible.' });
      }
      const otraPropia = await f.db.getRepository(Cita).findOneByOrFail({ negocioId: actor.negocioId!, personalId: f.negocios[0].profesionales[1] });
      await expect(f.agenda.detalle(identidad, String(otraPropia.id), {})).rejects.toMatchObject({ status: 404 });
    });
  });

  it('T033 ordena por instante/versión, pagina y no expone sesión pública ni campos arbitrarios de JSON', async () => {
    await conAgendaHttp(async (f) => {
      const actor = f.actor(Rol.ADMIN_NEGOCIO);
      const identidad = { sub: actor.id, sesionId: actor.sesionId };
      const id = f.negocios[0].ocupaciones[0];
      const sesion = await f.db.query('INSERT INTO sesiones_reserva_publica(negocio_id,titular_hash,generacion) VALUES(?,?,0)', [actor.negocioId, 'f'.repeat(64)]);
      // Son fixtures del lector, no evidencia de escritores manuales aún pendientes.
      for (const version of [2, 1, 3]) await f.db.getRepository(EventoCita).insert({ negocioId: actor.negocioId!, citaId: id,
        actorUsuarioId: version === 1 ? null : actor.id, sesionPublicaId: version === 1 ? Number(sesion.insertId) : null, accion: version === 1 ? 'alta' : 'cambio_estado',
        ocurridoEn: new Date(version === 3 ? '2026-01-02T00:00:00Z' : '2026-01-01T00:00:00Z'), versionResultante: version,
        valoresAntes: null, valoresDespues: { estado: 'confirmada', password: 'secreto-fixture', telefonoContacto: '6149999999' }, motivo: 'Corrección de prueba' });
      const primera = await f.agenda.historial(identidad, String(id), { limite: '2' });
      expect(primera.eventos.map((e) => e.versionResultante)).toEqual([1, 2]);
      expect(primera.hayMas).toBe(true);
      const ultima = await f.agenda.historial(identidad, String(id), { limite: '2', pagina: '2' });
      expect(ultima.eventos.map((e) => e.versionResultante)).toEqual([3]);
      expect(ultima.hayMas).toBe(false);
      const json = JSON.stringify(primera);
      expect(json).not.toMatch(/secreto-fixture|6149999999|sesionPublicaId/);
      expect(primera.eventos[0]).toMatchObject({ actorUsuarioId: null, origenActor: 'portal_publico', motivo: 'Corrección de prueba' });
      expect(primera.eventos[1]).toMatchObject({ actorUsuarioId: actor.id, origenActor: 'personal' });
      const http = await request(f.http).get(`/citas/${id}/historial`).query({ limite: '2' })
        .set('Authorization', `Bearer ${f.token(actor.id)}`).expect(200);
      expect(http.body.eventos.map((e: EventoCita) => e.versionResultante)).toEqual([1, 2]);
      expect(http.headers['cache-control']).toBe('no-store');
      expect(JSON.stringify(http.body)).not.toMatch(/sesionPublicaId|secreto-fixture|6149999999/);
      await expect(f.agenda.historial(identidad, String(f.negocios[1].ocupaciones[0]), {})).rejects.toMatchObject({ status: 404 });
    });
  });
});
