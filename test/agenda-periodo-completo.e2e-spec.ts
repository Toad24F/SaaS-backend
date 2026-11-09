import request from 'supertest';
import { Cita } from '../src/disponibilidad/entities/cita.entity';
import { Rol } from '../src/auth/enums/rol.enum';
import { conAgendaHttp } from './support/agenda-http';

const periodo = { desde: '2025-12-29', hasta: '2026-02-08' }; // Seis semanas completas.
type Escenario = Parameters<Parameters<typeof conAgendaHttp>[0]>[0];

/** Volumen sintético en la base efímera: canceladas evita confundir esta prueba con un benchmark de causas. */
async function agregarCitas(f: Escenario, cantidad: number) {
  const base = await f.db.getRepository(Cita).findOneByOrFail({ id: f.negocios[0].ocupaciones[0] });
  await f.db.getRepository(Cita).insert(Array.from({ length: cantidad }, (_, i) => ({
    negocioId: base.negocioId, sucursalId: base.sucursalId, personalId: f.negocios[0].profesionales[1],
    servicioId: base.servicioId, clienteId: base.clienteId, estado: 'cancelada' as const, origen: 'manual' as const,
    inicioUtc: new Date('2026-01-15T12:00:00Z'), finUtc: new Date('2026-01-15T12:30:00Z'),
    zonaHorariaReserva: base.zonaHorariaReserva, nombreContacto: 'Paciente del periodo', folio: `COMPLETO-${i}`,
  })));
}
const autenticacion = (f: Escenario) => `Bearer ${f.token(f.actor(Rol.ADMIN_NEGOCIO).id)}`;

describe('Agenda completa: contrato HTTP y límites sin truncamiento', () => {
  it('entrega más de cien citas de 42 fechas en una respuesta ligera, con detalle e historial conservados', async () => {
    await conAgendaHttp(async (f) => {
      await agregarCitas(f, 105);
      const filas = await f.db.getRepository(Cita).findBy({ negocioId: f.negocios[0].id });
      // Los dos extremos civiles se incluyen; el día 43 no pertenece a la cuadrícula.
      await f.db.getRepository(Cita).update(filas[0].id, { zonaHorariaReserva: 'UTC',
        inicioUtc: new Date('2025-12-29T00:00:00Z'), finUtc: new Date('2025-12-29T00:30:00Z'), finOcupacionUtc: null });
      await f.db.getRepository(Cita).update(filas[1].id, { zonaHorariaReserva: 'UTC',
        inicioUtc: new Date('2026-02-08T23:45:00Z'), finUtc: new Date('2026-02-09T00:15:00Z'), finOcupacionUtc: null });
      const base = filas[0];
      await f.db.getRepository(Cita).insert({ negocioId: base.negocioId, sucursalId: base.sucursalId,
        personalId: base.personalId, servicioId: base.servicioId, clienteId: base.clienteId, estado: 'cancelada',
        inicioUtc: new Date('2026-02-09T00:00:00Z'), finUtc: new Date('2026-02-09T00:30:00Z'), zonaHorariaReserva: 'UTC', folio: 'FUERA-DE-42' });
      const auth = autenticacion(f);
      const r = await request(f.http).get('/citas').query(periodo).set('Authorization', auth).expect(200);
      expect(r.body).toMatchObject(periodo);
      expect(r.body.citas).toHaveLength(111);
      expect(new Set(r.body.citas.map((c: Cita) => c.id)).size).toBe(111);
      expect(r.body.citas[0].fechaLocal).toBe('2025-12-29');
      expect(r.body.citas.at(-1)).toMatchObject({ fechaLocal: '2026-02-08', fechaFinLocal: '2026-02-09' });
      for (const campo of ['pagina', 'limite', 'hayMas']) expect(r.body).not.toHaveProperty(campo);
      for (const campo of ['telefonoContacto', 'motivoConsulta', 'costoAceptado', 'clienteId']) expect(r.body.citas[0]).not.toHaveProperty(campo);
      expect(r.headers['cache-control']).toBe('no-store');
      const id = f.negocios[0].ocupaciones[0];
      const detalle = await request(f.http).get(`/citas/${id}`).set('Authorization', auth).expect(200);
      expect(detalle.body).toMatchObject({ telefonoContacto: '6141234567', motivoConsulta: 'Nota propia' });
      const historial = await request(f.http).get(`/citas/${id}/historial`).query({ pagina: '1', limite: '2' }).set('Authorization', auth).expect(200);
      expect(historial.body).toMatchObject({ pagina: 1, limite: 2, eventos: [], hayMas: false });
      for (const query of [{ ...periodo, hasta: '2026-02-09' }, { ...periodo, pagina: '1' }, { ...periodo, limite: '100' }]) {
        await request(f.http).get('/citas').query(query).set('Authorization', auth).expect(400);
      }
    });
  });

  it('admite exactamente 1.000 citas del negocio y conserva los cinco estados', async () => {
    await conAgendaHttp(async (f) => {
      await agregarCitas(f, 994);
      const r = await request(f.http).get('/citas').query(periodo).set('Authorization', autenticacion(f)).expect(200);
      expect(r.body.citas).toHaveLength(1000);
      expect(new Set(r.body.citas.map((c: Cita) => c.estado)).size).toBe(5);
      expect(r.body.citas.every((c: Cita) => c.negocioId === f.negocios[0].id)).toBe(true);
    });
  });

  it('rechaza 1.001 antes de calcular causas, informa cómo acotar y permite reintentar filtrando', async () => {
    await conAgendaHttp(async (f) => {
      await agregarCitas(f, 995);
      const espia = jest.spyOn(f.afectadas, 'causasParaCita');
      const auth = autenticacion(f);
      try {
        const r = await request(f.http).get('/citas').query(periodo).set('Authorization', auth).expect(400);
        expect(r.body.codigo).toBe('agenda_demasiado_amplia');
        expect(r.body.message).toMatch(/Reduce.*rango.*filtra/);
        expect(r.body).not.toHaveProperty('citas');
        expect(r.headers['cache-control']).toBe('no-store');
        expect(espia).not.toHaveBeenCalled();
      } finally { espia.mockRestore(); }
      const r = await request(f.http).get('/citas').query({ ...periodo, personalId: String(f.negocios[0].profesionales[0]) }).set('Authorization', auth).expect(200);
      expect(r.body.citas).toHaveLength(5);
    });
  });

  it('mantiene una fotografía completa ante cambios de otra conexión y los ve en la siguiente consulta', async () => {
    await conAgendaHttp(async (f) => {
      const auth = autenticacion(f);
      const id = f.negocios[0].ocupaciones[0];
      const ids = (await f.db.getRepository(Cita).findBy({ negocioId: f.negocios[0].id })).map((c) => c.id).sort((a, b) => a - b);
      const calcular = f.afectadas.causasParaCita.bind(f.afectadas);
      const espia = jest.spyOn(f.afectadas, 'causasParaCita').mockImplementationOnce(async (ctx, cita) => {
        await f.segunda.getRepository(Cita).update(id, { inicioUtc: new Date('2026-03-01T12:00:00Z'), finUtc: new Date('2026-03-01T12:30:00Z') });
        expect((await ctx.manager.getRepository(Cita).findOneByOrFail({ id })).inicioUtc.getTime()).not.toBe(Date.parse('2026-03-01T12:00:00Z'));
        return calcular(ctx, cita);
      });
      try {
        const primero = await request(f.http).get('/citas').query(periodo).set('Authorization', auth).expect(200);
        expect(primero.body.citas.map((c: Cita) => c.id).sort((a: number, b: number) => a - b)).toEqual(ids);
      } finally { espia.mockRestore(); }
      const siguiente = await request(f.http).get('/citas').query(periodo).set('Authorization', auth).expect(200);
      expect(siguiente.body.citas.map((c: Cita) => c.id).sort((a: number, b: number) => a - b)).toEqual(ids.filter((c) => c !== id));
    });
  });
});
