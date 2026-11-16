import { Rol } from '../src/auth/enums/rol.enum';
import { CambioEstadoCitaService } from '../src/citas/cambio-estado-cita.service';
import { Cita } from '../src/disponibilidad/entities/cita.entity';
import { EventoCita } from '../src/citas/entities/evento-cita.entity';
import { conAgendaHttp } from './support/agenda-http';
import { prepararEstado } from './support/estado-cita';
import { situarSesion } from './support/acceso-operativo';
import { filasManuales } from './support/cita-manual';

describe('M4-T073: motivo opcional y correcciones conservadas en historial', () => {
  const previo = process.env.CITAS_MANUALES_HMAC_SECRET;
  beforeAll(() => { process.env.CITAS_MANUALES_HMAC_SECRET = 'secreto-estable-tests-historial-t073'; });
  afterAll(() => { if (previo === undefined) delete process.env.CITAS_MANUALES_HMAC_SECRET; else process.env.CITAS_MANUALES_HMAC_SECRET = previo; });

  it.each([undefined, '  Solicitud de la persona  '])('cancelación con motivo=%s conserva anterior/nuevo sin modificar notas', async (motivo) => {
    await conAgendaHttp(async (f) => {
      const m = await prepararEstado(f);
      const original = await f.db.getRepository(Cita).findOneByOrFail({ id: m.cita.id });
      await f.app.get(CambioEstadoCitaService).cambiar(m.identidad, String(original.id), { estado: 'cancelada', version: 1, motivo });
      const historial = await f.agenda.historial(m.identidad, String(original.id), {});
      expect(historial.eventos).toHaveLength(2);
      expect(historial.eventos[0]).not.toHaveProperty('motivo');
      const evento = historial.eventos[1];
      expect(evento).toMatchObject({ accion: 'cancelacion', actorUsuarioId: m.actor.id, origenActor: 'personal', ocurridoEn: f.reloj.ahora(),
        versionResultante: 2, valoresAntes: { estado: 'confirmada', version: 1 }, valoresDespues: { estado: 'cancelada', version: 2 } });
      if (motivo) expect(evento).toHaveProperty('motivo', motivo.trim());
      else expect(evento).not.toHaveProperty('motivo');
      expect(await f.db.getRepository(Cita).findOneByOrFail({ id: original.id })).toEqual({ ...original, estado: 'cancelada', version: 2 });
      const antes = await filasManuales(f.db);
      await f.app.get(CambioEstadoCitaService).cambiar(m.identidad, String(original.id), { estado: 'cancelada', version: 2, motivo: 'No sobrescribe el evento anterior' });
      expect(await filasManuales(f.db)).toEqual(antes);
    });
  });

  it.each(['completada', 'no_asistio'])('corregir %s conserva toda la cadena, actor e instantes, sin borrar eventos', async (estado) => {
    await conAgendaHttp(async (f) => {
      const m = await prepararEstado(f);
      const ahora = new Date(m.cita.finUtc); await situarSesion(f.db, m.actor, ahora); f.reloj.fijar(ahora);
      const servicio = f.app.get(CambioEstadoCitaService);
      await servicio.cambiar(m.identidad, String(m.cita.id), { estado, version: 1, ...(estado === 'no_asistio' ? { motivo: '<b>No llegó</b>' } : {}) });
      const primerCambio = await f.db.getRepository(EventoCita).find({ where: { citaId: m.cita.id }, order: { versionResultante: 'ASC' } });
      const receptor = f.actor(Rol.RECEPCIONISTA);
      await situarSesion(f.db, receptor, ahora); f.reloj.avanzar(1);
      await servicio.cambiar({ sub: receptor.id, sesionId: receptor.sesionId }, String(m.cita.id), { estado: 'confirmada', version: 2 });
      const historial = await f.agenda.historial(m.identidad, String(m.cita.id), { limite: '2' });
      expect(historial.hayMas).toBe(true);
      expect(historial.eventos[1]).toMatchObject({ actorUsuarioId: m.actor.id, ocurridoEn: ahora,
        valoresAntes: { estado: 'confirmada', version: 1 }, valoresDespues: { estado, version: 2 } });
      if (estado === 'no_asistio') expect(historial.eventos[1].motivo).toBe('<b>No llegó</b>');
      else expect(historial.eventos[1]).not.toHaveProperty('motivo');
      const ultima = await f.agenda.historial(m.identidad, String(m.cita.id), { limite: '2', pagina: '2' });
      expect(ultima.eventos).toHaveLength(1);
      expect(ultima.eventos[0]).toMatchObject({ actorUsuarioId: receptor.id, ocurridoEn: f.reloj.ahora(), versionResultante: 3,
        valoresAntes: { estado, version: 2 }, valoresDespues: { estado: 'confirmada', version: 3 } });
      expect(ultima.eventos[0]).not.toHaveProperty('motivo');
      expect(await f.db.getRepository(EventoCita).find({ where: { citaId: m.cita.id, versionResultante: 2 } })).toEqual([primerCambio[1]]);
      expect(JSON.stringify([historial, ultima])).not.toMatch(/6141234567|Nota de aceptación manual|sesionPublicaId|contenidoHash/);
    });
  });
});
