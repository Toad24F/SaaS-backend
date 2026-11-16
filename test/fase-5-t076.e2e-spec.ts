import request from 'supertest';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { RELOJ } from '../src/comun/reloj';
import { Rol } from '../src/auth/enums/rol.enum';
import { CambioEstadoCitaService } from '../src/citas/cambio-estado-cita.service';
import { IntentosCitaManualService } from '../src/citas/intentos-cita-manual.service';
import { AccesoOperativoService } from '../src/citas/acceso-operativo.service';
import { conAgendaHttp } from './support/agenda-http';
import { prepararEstado, ocupacionesEstado } from './support/estado-cita';
import { filasManuales, esperarBloqueoManual, RUTA_MANUAL } from './support/cita-manual';

const carreras = [
  ...['estado', 'reserva'].flatMap((primero) => ['igual', 'solo_separacion'].map((relacion) => ({ accion: 'reactivar', primero, relacion }))),
  ...['estado', 'reserva'].map((primero) => ({ accion: 'cancelar', primero, relacion: 'igual' })),
];

describe('M4-T076: cancelación/reactivación HTTP contra escritor manual real', () => {
  const previo = process.env.CITAS_MANUALES_HMAC_SECRET;
  beforeAll(() => { process.env.CITAS_MANUALES_HMAC_SECRET = 'secreto-estable-carreras-http-estados-t076'; });
  afterAll(() => { if (previo === undefined) delete process.env.CITAS_MANUALES_HMAC_SECRET; else process.env.CITAS_MANUALES_HMAC_SECRET = previo; });

  it.each(carreras)('$accion contra reserva, primero=$primero, relación=$relacion', async ({ accion, primero, relacion }) => {
    await conAgendaHttp(async (f) => {
      const m = await prepararEstado(f);
      const reactivar = accion === 'reactivar';
      if (reactivar) await f.app.get(CambioEstadoCitaService).cambiar(m.identidad, String(m.cita.id), { estado: 'cancelada', version: 1 });
      const receptor = f.actor(Rol.RECEPCIONISTA);
      const seleccion = { ...m.nueva, horaInicio: relacion === 'igual' ? '09:17' : '09:50',
        clienteNuevo: { nombreCompleto: 'Persona rival', telefono: '6140008888' } };
      const clave = randomUUID();
      await f.app.get(IntentosCitaManualService).preparar({ sub: receptor.id, sesionId: receptor.sesionId }, clave, seleccion);
      const modulo = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(DataSource).useValue(f.segunda)
        .overrideProvider(RELOJ).useValue(f.reloj).compile();
      const otraApp = modulo.createNestApplication();
      await otraApp.init();
      const accesoB = otraApp.get(AccesoOperativoService);
      const resolverB = accesoB.resolverEnTransaccion.bind(accesoB);
      let conexionB = 0; let conexionA = 0;
      const observador = jest.spyOn(accesoB, 'resolverEnTransaccion').mockImplementation(async (...args) => {
        const ctx = await resolverB(...args); conexionB = Number((await ctx.manager.query('SELECT CONNECTION_ID() id'))[0].id); return ctx;
      });
      const crear = f.db.createQueryRunner.bind(f.db);
      const trazas: jest.SpyInstance[] = [];
      let retenido!: () => void; let abrir!: () => void;
      const bloqueado = new Promise<void>((r) => { retenido = r; });
      const barrera = new Promise<void>((r) => { abrir = r; });
      let pausa = false;
      let a: Promise<request.Response> | undefined; let b: Promise<request.Response> | undefined;
      let espia: jest.SpyInstance | undefined;
      try {
        const antes = await filasManuales(f.db);
        const apartados = await f.db.query('SELECT * FROM bloqueos_temporales ORDER BY id');
        espia = jest.spyOn(f.db, 'createQueryRunner').mockImplementation((...args) => {
          const runner = crear(...args); const query = runner.query.bind(runner);
          trazas.push(jest.spyOn(runner, 'query').mockImplementation(async (...consulta) => {
            const resultado = await query(...consulta);
            // Se detiene después del FOR UPDATE real del perfil, conservando todos los bloqueos del primer escritor.
            if (!pausa && /FROM `personal`/.test(consulta[0]) && consulta[0].includes('FOR UPDATE')) {
              pausa = true; conexionA = Number((await query('SELECT CONNECTION_ID() id'))[0].id); retenido(); await barrera;
            }
            return resultado;
          }));
          return runner;
        });
        const cambiar = (http: ReturnType<typeof f.app.getHttpServer>) => request(http).patch(m.ruta).set('Authorization', m.auth)
          .send({ estado: reactivar ? 'confirmada' : 'cancelada', version: reactivar ? 2 : 1 });
        const reservar = (http: ReturnType<typeof f.app.getHttpServer>) => request(http).post(`${RUTA_MANUAL}/${clave}/registrar`)
          .set('Authorization', `Bearer ${f.token(receptor.id)}`).send(seleccion);
        a = (primero === 'estado' ? cambiar(f.http) : reservar(f.http)).then((r) => r);
        // Si falta la ruta o falla el primer escritor, no dejar una barrera esperando indefinidamente.
        await Promise.race([bloqueado, a.then(() => { throw new Error('El primer escritor terminó antes de tomar el bloqueo esperado.'); })]);
        b = (primero === 'estado' ? reservar(otraApp.getHttpServer()) : cambiar(otraApp.getHttpServer())).then((r) => r);
        await esperarBloqueoManual(f.db, () => conexionB, 'usuarios');
        expect(conexionA).not.toBe(conexionB);
        abrir();
        const [rA, rB] = await Promise.all([a, b]);
        const estado = primero === 'estado' ? rA : rB;
        const reserva = primero === 'reserva' ? rA : rB;
        const ganaReserva = reactivar ? primero === 'reserva' : primero === 'estado';
        expect(reserva.status).toBe(ganaReserva ? 201 : 409);
        expect(estado.status).toBe(reactivar && ganaReserva ? 409 : 200);
        expect(reserva.headers['cache-control']).toBe('no-store'); expect(estado.headers['cache-control']).toBe('no-store');
        const despues = await filasManuales(f.db);
        const original = despues.citas.find((c) => c.id === m.cita.id)!;
        expect(original.estado).toBe(reactivar && !ganaReserva ? 'confirmada' : 'cancelada');
        expect(original.version).toBe(reactivar && !ganaReserva ? 3 : 2);
        expect(original).toEqual({ ...antes.citas.find((c) => c.id === m.cita.id), estado: original.estado, version: original.version });
        expect(despues.citas.filter((c) => ![m.cita.id, reserva.body.id].includes(c.id)))
          .toEqual(antes.citas.filter((c) => c.id !== m.cita.id));
        expect(despues.clientes.length).toBe(antes.clientes.length + Number(ganaReserva));
        expect(despues.auditoria.length).toBe(antes.auditoria.length + Number(ganaReserva));
        const nuevosEventos = despues.eventos.filter((e) => !antes.eventos.some((anterior) => anterior.id === e.id));
        expect(nuevosEventos).toHaveLength(Number(ganaReserva) + Number(!reactivar || !ganaReserva));
        expect(new Set(despues.eventos.map((e) => `${e.citaId}:${e.versionResultante}`)).size).toBe(despues.eventos.length);
        expect(despues.eventos.filter((e) => antes.eventos.some((anterior) => anterior.id === e.id))).toEqual(antes.eventos);
        if (!reactivar || !ganaReserva) {
          expect(nuevosEventos.find((e) => e.citaId === original.id)).toMatchObject({ actorUsuarioId: m.actor.id,
            accion: reactivar ? 'reactivacion' : 'cancelacion', ocurridoEn: f.reloj.ahora(), versionResultante: original.version,
            valoresAntes: { estado: reactivar ? 'cancelada' : 'confirmada', version: reactivar ? 2 : 1 },
            valoresDespues: { estado: original.estado, version: original.version } });
        }
        if (ganaReserva) {
          expect(despues.intentos.find((i) => i.clave === clave)).toMatchObject({ estado: 'registrado', citaId: reserva.body.id });
          expect(nuevosEventos.find((e) => e.citaId === reserva.body.id)).toMatchObject({ accion: 'alta', actorUsuarioId: receptor.id, versionResultante: 1 });
        } else {
          expect(despues.intentos.find((i) => i.clave === clave)).toEqual(antes.intentos.find((i) => i.clave === clave));
        }
        const ocupaciones = await ocupacionesEstado(f, m.cita);
        const incompatibles = ocupaciones.filter((o) => o.tipo === 'cita' && [m.cita.id, reserva.body.id].includes(o.id));
        expect(incompatibles).toHaveLength(reactivar || ganaReserva ? 1 : 0);
        expect(await f.db.query('SELECT * FROM bloqueos_temporales ORDER BY id')).toEqual(apartados);
      } finally {
        abrir(); await Promise.allSettled([a, b].filter((p) => p !== undefined));
        espia?.mockRestore(); observador.mockRestore(); for (const traza of trazas) traza.mockRestore();
        await otraApp.close();
      }
    });
  });
});
