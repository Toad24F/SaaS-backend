import { AccesoOperativoService } from '../src/citas/acceso-operativo.service';
import { esperarBloqueoManual } from './support/cita-manual';
import { CambioHorarioCitaService } from '../src/citas/cambio-horario-cita.service';
import { CambioEstadoCitaService } from '../src/citas/cambio-estado-cita.service';
import { MotorDisponibilidadService } from '../src/disponibilidad/motor-disponibilidad.service';
import { Rol } from '../src/auth/enums/rol.enum';
import { conAgendaHttp } from './support/agenda-http';
import { prepararEstado } from './support/estado-cita';
import { filasManuales } from './support/cita-manual';
import { situarSesion } from './support/acceso-operativo';

const destino = { fechaLocal: '2026-11-09', horaInicio: '09:20', version: 1 };
describe('M4-T077–T082: movimiento interno real', () => {
  const previo = process.env.CITAS_MANUALES_HMAC_SECRET;
  beforeAll(() => { process.env.CITAS_MANUALES_HMAC_SECRET = 'secreto-pruebas-movimiento-m4-t077'; });
  afterAll(() => { if (previo === undefined) delete process.env.CITAS_MANUALES_HMAC_SECRET; else process.env.CITAS_MANUALES_HMAC_SECRET = previo; });

  it.each([Rol.ADMIN_NEGOCIO, Rol.RECEPCIONISTA])('%s mueve sobre su propio intervalo con duración/separación históricas y audita sin cambiar snapshots', async rol => {
    await conAgendaHttp(async f => {
      const m = await prepararEstado(f, rol);
      await f.db.query('UPDATE servicios SET costo=999,duracion_minutos=90 WHERE id=?', [m.seleccion.servicioId]);
      await f.db.query('UPDATE configuracion_agenda SET tiempo_entre_citas_minutos=60 WHERE negocio_id=?', [f.negocios[0].id]);
      await f.db.query('UPDATE horarios_personal SET fin_minutos=600 WHERE negocio_id=?', [f.negocios[0].id]);
      const antes = await filasManuales(f.db);
      const original = antes.citas.find(c => c.id === m.cita.id)!;
      const resultado = await f.app.get(CambioHorarioCitaService).cambiar(m.identidad, String(m.cita.id), destino);
      expect(resultado).toMatchObject({ id: original.id, folio: original.folio, version: 2,
        inicioUtc: '2026-11-09T15:20:00.000Z', finUtc: '2026-11-09T15:50:00.000Z', finOcupacionUtc: '2026-11-09T16:00:00.000Z' });
      const despues = await filasManuales(f.db);
      expect(despues.citas).toEqual(antes.citas.map(c => c.id === original.id ? { ...c, version: 2,
        inicioUtc: new Date(resultado.inicioUtc), finUtc: new Date(resultado.finUtc), finOcupacionUtc: new Date(resultado.finOcupacionUtc) } : c));
      expect(despues.clientes).toEqual(antes.clientes); expect(despues.intentos).toEqual(antes.intentos); expect(despues.auditoria).toEqual(antes.auditoria);
      expect(despues.eventos.slice(0, -1)).toEqual(antes.eventos);
      expect(despues.eventos.at(-1)).toMatchObject({ accion: 'cambio_horario', actorUsuarioId: m.actor.id, ocurridoEn: f.reloj.ahora(), versionResultante: 2,
        valoresAntes: { inicioUtc: original.inicioUtc.toISOString(), finUtc: original.finUtc.toISOString(), zonaHoraria: original.zonaHorariaReserva, version: 1 },
        valoresDespues: { inicioUtc: resultado.inicioUtc, finUtc: resultado.finUtc, finOcupacionUtc: resultado.finOcupacionUtc, version: 2 } });
      const historial = await f.agenda.historial(m.identidad, String(original.id), {});
      expect(historial.eventos.at(-1)).toMatchObject({ valoresAntes: { zonaHoraria: original.zonaHorariaReserva },
        valoresDespues: { zonaHoraria: original.zonaHorariaReserva, inicioUtc: resultado.inicioUtc } });
      // Repetir con versión vigente no crea un movimiento ficticio; la edición antigua siempre falla.
      await f.app.get(CambioHorarioCitaService).cambiar(m.identidad, String(m.cita.id), { ...destino, version: 2 });
      await expect(f.app.get(CambioHorarioCitaService).cambiar(m.identidad, String(m.cita.id), destino)).rejects.toMatchObject({ status: 409 });
      expect(await filasManuales(f.db)).toEqual(despues);
    });
  });


  it('interpreta el destino en la zona vigente y conserva la zona anterior en el historial', async () => {
    await conAgendaHttp(async f => {
      const m = await prepararEstado(f);
      await f.db.query("UPDATE sucursales SET zona_horaria='America/Tijuana' WHERE id=?", [m.seleccion.sucursalId]);
      const antes = await filasManuales(f.db);
      const resultado = await f.app.get(CambioHorarioCitaService).cambiar(m.identidad, String(m.cita.id), destino);
      expect(resultado).toMatchObject({ zonaHoraria: 'America/Tijuana', inicioUtc: '2026-11-09T17:20:00.000Z',
        finUtc: '2026-11-09T17:50:00.000Z', finOcupacionUtc: '2026-11-09T18:00:00.000Z', version: 2 });
      const despues = await filasManuales(f.db);
      const original = antes.citas.find(c => c.id === m.cita.id)!;
      expect(despues.citas).toEqual(antes.citas.map(c => c.id === m.cita.id ? { ...c, version: 2,
        inicioUtc: new Date(resultado.inicioUtc), finUtc: new Date(resultado.finUtc), finOcupacionUtc: new Date(resultado.finOcupacionUtc), zonaHorariaReserva: 'America/Tijuana' } : c));
      const historial = await f.agenda.historial(m.identidad, String(m.cita.id), {});
      expect(historial.eventos.at(-1)).toMatchObject({ valoresAntes: { zonaHoraria: original.zonaHorariaReserva },
        valoresDespues: { zonaHoraria: 'America/Tijuana' } });
    });
  });

  it.each(['oferta', 'horario', 'bloqueo', 'cita', 'apartado', 'licencia', 'cancelada', 'pasada', 'destino_pasado', 'ambigua', 'inexistente'])
    ('revalida %s y conserva íntegramente las filas ante rechazo', async caso => {
      await conAgendaHttp(async f => {
        const m = await prepararEstado(f); const s = m.seleccion;
        let entrada = { ...destino };
        if (caso === 'oferta') await f.db.query('UPDATE personal_servicios_sucursales SET activo=0 WHERE negocio_id=?', [f.negocios[0].id]);
        if (caso === 'horario') await f.db.query('UPDATE horarios_personal SET fin_minutos=599 WHERE negocio_id=?', [f.negocios[0].id]);
        if (caso === 'bloqueo') await f.db.query(`INSERT INTO bloqueos_horario
          (negocio_id,personal_id,sucursal_id,creador_usuario_id,tipo,fecha_inicio,fecha_fin,inicio_minutos,fin_minutos,motivo)
          VALUES(?,?,?,?,'emergencia','2026-11-09','2026-11-09',550,600,'Prueba')`, [f.negocios[0].id, s.personalId, s.sucursalId, m.actor.id]);
        // El rival en otra sede invade únicamente la separación del destino, después de la atención.
        if (caso === 'cita') await f.db.query(`INSERT INTO citas
          (negocio_id,sucursal_id,personal_id,servicio_id,cliente_id,inicio_utc,fin_utc,zona_horaria_reserva,folio)
          VALUES(?,?,?,?,?,'2026-11-09 15:55:00','2026-11-09 16:20:00','America/Mexico_City','RIVAL-MOV')`,
          [f.negocios[0].id, f.negocios[0].sucursales[1].id, s.personalId, s.servicioId, s.clienteId]);
        if (caso === 'apartado') await f.db.query(`INSERT INTO bloqueos_temporales
          (negocio_id,personal_id,sucursal_id,servicio_id,inicio_utc,fin_utc,expira_en,titular_hash)
          VALUES(?,?,?,?,'2026-11-09 15:55:00','2026-11-09 16:20:00',?,?)`,
          [f.negocios[0].id, s.personalId, f.negocios[0].sucursales[1].id, s.servicioId, new Date(f.reloj.ahora().getTime() + 300000), 'f'.repeat(64)]);
        if (caso === 'licencia') await f.db.query('UPDATE licencias SET vence_en=? WHERE negocio_id=?', [f.reloj.ahora(), f.negocios[0].id]);
        if (caso === 'cancelada') {
          await f.app.get(CambioEstadoCitaService).cambiar(m.identidad, String(m.cita.id), { estado: 'cancelada', version: 1 }); entrada.version = 2;
        }
        if (caso === 'pasada') { const ahora = new Date(m.cita.inicioUtc); await situarSesion(f.db, m.actor, ahora); f.reloj.fijar(ahora); }
        if (caso === 'destino_pasado') entrada.fechaLocal = '2026-11-08';
        if (['ambigua', 'inexistente'].includes(caso)) {
          await f.db.query("UPDATE sucursales SET zona_horaria='America/New_York' WHERE id=?", [s.sucursalId]);
          entrada = { ...entrada, fechaLocal: caso === 'ambigua' ? '2027-11-07' : '2027-03-14', horaInicio: caso === 'ambigua' ? '01:30' : '02:30' };
        }
        const antes = await filasManuales(f.db);
        await expect(f.app.get(CambioHorarioCitaService).cambiar(m.identidad, String(m.cita.id), entrada))
          .rejects.toMatchObject({ status: caso === 'licencia' ? 401 : ['ambigua', 'inexistente'].includes(caso) ? 400 : 409 });
        expect(await filasManuales(f.db)).toEqual(antes);
      });
    });

  it('solo excluye la cita del negocio y Profesional comprobados; deniega roles, IDs ajenos y transacción ausente', async () => {
    await conAgendaHttp(async f => {
      const m = await prepararEstado(f); const servicio = f.app.get(CambioHorarioCitaService);
      const antes = await filasManuales(f.db);
      for (const rol of [Rol.PROFESIONAL, Rol.SUPERADMIN]) {
        const actor = f.actores.find(a => a.rol === rol)!;
        await expect(servicio.cambiar({ sub: actor.id, sesionId: actor.sesionId }, String(m.cita.id), destino)).rejects.toMatchObject({ status: 403 });
      }
      for (const id of [f.negocios[1].ocupaciones[0], 4294967295]) {
        await expect(servicio.cambiar(m.identidad, String(id), destino)).rejects.toMatchObject({ status: 404 });
      }
      const motor = f.app.get(MotorDisponibilidadService);
      await f.db.transaction('READ COMMITTED', async manager => {
        await expect(motor.revalidarMovimientoEnTransaccion(manager, m.identidad, f.negocios[1].ocupaciones[0], destino, f.reloj.ahora())).rejects.toBeDefined();
        // La consulta ordinaria sigue viendo la propia ocupación; la exclusión solo existe en la entrada interna.
        expect((await motor.revalidarEnTransaccion(manager, m.identidad, { ...m.seleccion, modalidad: 'manual' }, f.reloj.ahora())).valido).toBe(false);
      });
      await expect(motor.revalidarMovimientoEnTransaccion(f.db.manager, m.identidad, m.cita.id, destino, f.reloj.ahora())).rejects.toThrow();
      expect(await filasManuales(f.db)).toEqual(antes);
    });
  });

  it.each(['citas', 'eventos_cita'])('rollback tras SQL real en %s conserva horario, versión e historial', async tabla => {
    await conAgendaHttp(async f => {
      const m = await prepararEstado(f); const antes = await filasManuales(f.db);
      const crear = f.db.createQueryRunner.bind(f.db); const trazas: jest.SpyInstance[] = []; let fallo = false;
      // El fallo ocurre después de ejecutar la escritura, para comprobar rollback real y no solo validación previa.
      const espia = jest.spyOn(f.db, 'createQueryRunner').mockImplementation((...args) => {
        const runner = crear(...args); const ejecutar = runner.query.bind(runner);
        trazas.push(jest.spyOn(runner, 'query').mockImplementation(async (...consulta) => {
          const resultado = await ejecutar(...consulta);
          if (!fallo && /^(UPDATE|INSERT INTO) /.test(consulta[0]) && consulta[0].split('`')[1] === tabla) { fallo = true; throw new Error('Fallo después del SQL real'); }
          return resultado;
        })); return runner;
      });
      try {
        await expect(f.app.get(CambioHorarioCitaService).cambiar(m.identidad, String(m.cita.id), destino)).rejects.toMatchObject({ status: 500 });
        expect(fallo).toBe(true);
      } finally { espia.mockRestore(); for (const traza of trazas) traza.mockRestore(); }
      expect(await filasManuales(f.db)).toEqual(antes);
    });
  });
  it.each(['libre', 'version', 'reloj'])('T080/T081 espera real al Profesional y relee %s', async caso => {
    await conAgendaHttp(async f => {
      const m = await prepararEstado(f);
      if (caso === 'reloj') {
        const instante = new Date(Date.parse(m.cita.inicioUtc) - 1);
        await situarSesion(f.db, m.actor, instante); f.reloj.fijar(instante);
      }
      const antes = await filasManuales(f.db);
      const holder = f.segunda.createQueryRunner();
      const acceso = f.app.get(AccesoOperativoService); const resolver = acceso.resolverEnTransaccion.bind(acceso);
      let conexion = 0; let traza: jest.SpyInstance | undefined; const tablas: string[] = [];
      let pendiente: Promise<unknown> | undefined;
      // Observa SQL real y su conexión: no reemplaza el motor ni la escritura.
      const observador = jest.spyOn(acceso, 'resolverEnTransaccion').mockImplementation(async (...args) => {
        const ctx = await resolver(...args);
        if (!traza) {
          conexion = Number((await ctx.manager.query('SELECT CONNECTION_ID() id'))[0].id);
          const runner = ctx.manager.queryRunner!; const ejecutar = runner.query.bind(runner);
          traza = jest.spyOn(runner, 'query').mockImplementation(async (...consulta) => {
            if (consulta[0].includes('FOR UPDATE')) tablas.push(/FROM `([^`]+)`/.exec(consulta[0])?.[1] ?? 'desconocida');
            return ejecutar(...consulta);
          });
        }
        return ctx;
      });
      try {
        await holder.connect(); await holder.startTransaction('READ COMMITTED');
        const otroId = Number((await holder.query('SELECT CONNECTION_ID() id'))[0].id);
        await holder.query('SELECT id FROM personal WHERE id=? FOR UPDATE', [m.seleccion.personalId]);
        pendiente = f.app.get(CambioHorarioCitaService).cambiar(m.identidad, String(m.cita.id), destino)
          .then(valor => ({ valor }), (error: unknown) => ({ error }));
        await esperarBloqueoManual(f.segunda, () => conexion, 'personal');
        expect(conexion).not.toBe(otroId);
        if (caso === 'version') await holder.query('UPDATE citas SET version=2 WHERE id=?', [m.cita.id]);
        if (caso === 'reloj') f.reloj.avanzar(1);
        await holder.commitTransaction();
        const resultado = await pendiente;
        expect(tablas).toEqual(['usuarios', 'usuarios', 'negocios', 'licencias', 'sucursales', 'servicios', 'personal', 'citas']);
        if (caso === 'libre') expect(resultado).toMatchObject({ valor: { version: 2 } });
        else {
          expect(resultado).toMatchObject({ error: { status: 409 } });
          const esperado = caso === 'version' ? { ...antes, citas: antes.citas.map(c => c.id === m.cita.id ? { ...c, version: 2 } : c) } : antes;
          expect(await filasManuales(f.db)).toEqual(esperado);
        }
      } finally {
        if (holder.isTransactionActive) await holder.rollbackTransaction();
        if (pendiente) await pendiente;
        traza?.mockRestore(); observador.mockRestore(); await holder.release();
      }
    });
  });

});

