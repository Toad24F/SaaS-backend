import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { RELOJ } from '../src/comun/reloj';
import { Rol } from '../src/auth/enums/rol.enum';
import { CambioEstadoCitaService } from '../src/citas/cambio-estado-cita.service';
import { RegistroCitaManualService } from '../src/citas/registro-cita-manual.service';
import { IntentosCitaManualService } from '../src/citas/intentos-cita-manual.service';
import { AccesoOperativoService } from '../src/citas/acceso-operativo.service';
import { EventoCita } from '../src/citas/entities/evento-cita.entity';
import { Cita } from '../src/disponibilidad/entities/cita.entity';
import { MotorDisponibilidadService } from '../src/disponibilidad/motor-disponibilidad.service';
import { OcupacionesService } from '../src/disponibilidad/ocupaciones.service';
import { CupoTelefonicoService } from '../src/reservas-publicas/cupo-telefonico.service';
import { situarSesion } from './support/acceso-operativo';
import { conAgendaHttp } from './support/agenda-http';
import { prepararManual, filasManuales, esperarBloqueoManual, type EscenarioManualHttp } from './support/cita-manual';

/** Cada cita del lote nace con el escritor manual real, su snapshot y evento inicial. */
async function preparar(f: EscenarioManualHttp, rol = Rol.ADMIN_NEGOCIO) {
  const m = await prepararManual(f, rol);
  const clave = randomUUID();
  await f.app.get(IntentosCitaManualService).preparar(m.identidad, clave, m.seleccion);
  const cita = await f.app.get(RegistroCitaManualService).registrar(m.identidad, clave, m.seleccion);
  return { ...m, cita, cambios: f.app.get(CambioEstadoCitaService) };
}

async function ocupadas(f: EscenarioManualHttp, cita: { personalId: number; inicioUtc: string; finOcupacionUtc: string }) {
  return f.db.transaction('READ COMMITTED', (manager) => f.app.get(OcupacionesService).consultar({ manager,
    negocioId: f.negocios[0].id, personalId: cita.personalId, ahora: f.reloj.ahora() },
  new Date(cita.inicioUtc), new Date(cita.finOcupacionUtc)));
}

describe('M4-T068–T072: estados, versión, atomicidad y reactivación reales', () => {
  const previo = process.env.CITAS_MANUALES_HMAC_SECRET;
  beforeAll(() => { process.env.CITAS_MANUALES_HMAC_SECRET = 'secreto-fijo-de-pruebas-estados-t068-t072'; });
  afterAll(() => { if (previo === undefined) delete process.env.CITAS_MANUALES_HMAC_SECRET; else process.env.CITAS_MANUALES_HMAC_SECRET = previo; });

  it.each([Rol.ADMIN_NEGOCIO, Rol.RECEPCIONISTA])('T068/T069 %s cambia, repite sin evento y rechaza versión vieja incluso para el mismo estado', async (rol) => {
    await conAgendaHttp(async (f) => {
      const m = await preparar(f, rol);
      const original = await f.db.getRepository(Cita).findOneByOrFail({ id: m.cita.id });
      const cambiar = (estado: string, version: number) => m.cambios.cambiar(m.identidad, String(m.cita.id), { estado, version });
      expect(await cambiar('pendiente', 1)).toMatchObject({ id: original.id, folio: original.folio, estado: 'pendiente', version: 2 });
      const antes = await filasManuales(f.db);
      expect(await cambiar('pendiente', 2)).toMatchObject({ estado: 'pendiente', version: 2 });
      expect(await filasManuales(f.db)).toEqual(antes);
      await expect(cambiar('pendiente', 1)).rejects.toMatchObject({ status: 409 });
      await expect(cambiar('cancelada', 1)).rejects.toMatchObject({ status: 409 });
      expect(await filasManuales(f.db)).toEqual(antes);
      expect(await cambiar('confirmada', 2)).toMatchObject({ estado: 'confirmada', version: 3 });
      const persistida = await f.db.getRepository(Cita).findOneByOrFail({ id: original.id });
      expect(persistida).toEqual({ ...original, estado: 'confirmada', version: 3 });
      const eventos = await f.db.getRepository(EventoCita).find({ where: { citaId: original.id }, order: { versionResultante: 'ASC' } });
      expect(eventos.map((e) => e.versionResultante)).toEqual([1, 2, 3]);
      expect(eventos[1]).toMatchObject({ accion: 'cambio_estado', actorUsuarioId: m.actor.id, ocurridoEn: f.reloj.ahora(),
        valoresAntes: { estado: 'confirmada', version: 1 }, valoresDespues: { estado: 'pendiente', version: 2 } });
      expect(JSON.stringify(eventos.slice(1))).not.toMatch(/6141234567|Nota de aceptación|contenidoHash|sesionId/);
      expect((await ocupadas(f, m.cita)).some((o) => o.tipo === 'cita' && o.id === original.id)).toBe(true);
    });
  });

  it.each(['completada', 'no_asistio'].flatMap((estado) => [-1, 0, 1].map((delta) => ({ estado, delta }))))
    ('T070 $estado con reloj finUtc+$delta ms respeta el límite de atención y conserva ocupación', async ({ estado, delta }) => {
      await conAgendaHttp(async (f) => {
        const m = await preparar(f);
        const instante = new Date(Date.parse(m.cita.finUtc) + delta);
        await situarSesion(f.db, m.actor, instante); f.reloj.fijar(instante);
        const antes = await filasManuales(f.db);
        const pendiente = m.cambios.cambiar(m.identidad, String(m.cita.id), { estado, version: 1 });
        if (delta < 0) {
          await expect(pendiente).rejects.toMatchObject({ status: 409 });
          expect(await filasManuales(f.db)).toEqual(antes);
        } else {
          expect(await pendiente).toMatchObject({ estado, version: 2 });
          expect((await ocupadas(f, m.cita)).some((o) => o.tipo === 'cita' && o.id === m.cita.id)).toBe(true);
          const persistida = await f.db.getRepository(Cita).findOneByOrFail({ id: m.cita.id });
          expect(persistida).toEqual({ ...antes.citas.find((c) => c.id === m.cita.id), estado, version: 2 });
        }
      });
    });

  it('T071 cancelar conserva la fila/snapshots y libera solo su ocupación con evento en el mismo commit', async () => {
    await conAgendaHttp(async (f) => {
      const m = await preparar(f);
      const antes = await filasManuales(f.db);
      const apartados = await f.db.query('SELECT * FROM bloqueos_temporales ORDER BY id');
      expect((await ocupadas(f, m.cita)).some((o) => o.id === m.cita.id && o.tipo === 'cita')).toBe(true);
      await m.cambios.cambiar(m.identidad, String(m.cita.id), { estado: 'cancelada', version: 1, motivo: '  Solicitud de la persona  ' });
      const despues = await filasManuales(f.db);
      expect(despues.citas).toEqual(antes.citas.map((c) => c.id === m.cita.id ? { ...c, estado: 'cancelada', version: 2 } : c));
      expect(despues.clientes).toEqual(antes.clientes); expect(despues.intentos).toEqual(antes.intentos); expect(despues.auditoria).toEqual(antes.auditoria);
      expect(await f.db.query('SELECT * FROM bloqueos_temporales ORDER BY id')).toEqual(apartados);
      expect((await ocupadas(f, m.cita)).some((o) => o.id === m.cita.id && o.tipo === 'cita')).toBe(false);
      expect(despues.eventos).toHaveLength(antes.eventos.length + 1);
      expect(despues.eventos.at(-1)).toMatchObject({ accion: 'cancelacion', motivo: 'Solicitud de la persona', actorUsuarioId: m.actor.id, versionResultante: 2 });
      const validacion = await f.app.get(MotorDisponibilidadService).validar(m.identidad, m.seleccion.personalId,
        m.seleccion.sucursalId, m.seleccion.servicioId, m.seleccion.fechaLocal, m.seleccion.horaInicio, 'manual');
      expect(validacion.valido).toBe(true);
    });
  });

  it.each(['libre', 'historico', 'zona_actual', 'cupo', 'oferta', 'horario', 'bloqueo', 'cita_otra_sucursal', 'apartado_otra_sucursal', 'inicio_exacto', 'inicio_pasado', 'licencia'])
    ('T072 reactivación con %s no altera snapshots ni ignora restricciones vigentes', async (caso) => {
      await conAgendaHttp(async (f) => {
        const m = await preparar(f);
        const s = m.seleccion;
        await m.cambios.cambiar(m.identidad, String(m.cita.id), { estado: 'cancelada', version: 1 });
        if (caso === 'historico') {
          // La duración/separación nuevas no caben; el compromiso histórico de 30+10 sí cabe hasta 09:57.
          await f.db.query('UPDATE servicios SET costo=999,duracion_minutos=90 WHERE id=?', [s.servicioId]);
          await f.db.query('UPDATE configuracion_agenda SET tiempo_entre_citas_minutos=60 WHERE negocio_id=?', [f.negocios[0].id]);
          await f.db.query('UPDATE horarios_personal SET fin_minutos=600 WHERE negocio_id=?', [f.negocios[0].id]);
        }
        if (caso === 'zona_actual') {
          await f.db.query("UPDATE sucursales SET zona_horaria='America/Tijuana' WHERE id=?", [s.sucursalId]);
          await f.db.query('UPDATE horarios_personal SET inicio_minutos=360,fin_minutos=600 WHERE negocio_id=?', [f.negocios[0].id]);
        }
        if (caso === 'cupo') {
          for (const hora of [18, 19]) await f.db.query(`INSERT INTO citas
            (negocio_id,sucursal_id,personal_id,servicio_id,cliente_id,inicio_utc,fin_utc,zona_horaria_reserva,folio,telefono_contacto)
            VALUES(?,?,?,?,?,?,?,'America/Chihuahua',?,'6141234567')`, [f.negocios[0].id, s.sucursalId, f.negocios[0].profesionales[1], s.servicioId,
            s.clienteId, `2026-11-09 ${hora}:00:00`, `2026-11-09 ${hora}:30:00`, `CUPO-${hora}`]);
        }
        if (caso === 'oferta') await f.db.query('UPDATE personal_servicios_sucursales SET activo=0 WHERE negocio_id=?', [f.negocios[0].id]);
        if (caso === 'horario') await f.db.query('UPDATE horarios_personal SET fin_minutos=580 WHERE negocio_id=?', [f.negocios[0].id]);
        if (caso === 'bloqueo') await f.db.query(`INSERT INTO bloqueos_horario
          (negocio_id,personal_id,sucursal_id,creador_usuario_id,tipo,fecha_inicio,fecha_fin,inicio_minutos,fin_minutos,motivo)
          VALUES(?,?,?,?,'emergencia','2026-11-09','2026-11-09',540,600,'Prueba')`, [f.negocios[0].id, s.personalId, s.sucursalId, m.actor.id]);
        if (caso === 'cita_otra_sucursal') await f.db.query(`INSERT INTO citas
          (negocio_id,sucursal_id,personal_id,servicio_id,cliente_id,inicio_utc,fin_utc,zona_horaria_reserva,folio)
          VALUES(?,?,?,?,?,'2026-11-09 15:50:00','2026-11-09 16:20:00','America/Mexico_City','RIVAL')`,
        [f.negocios[0].id, f.negocios[0].sucursales[1].id, s.personalId, s.servicioId, s.clienteId]);
        if (caso === 'apartado_otra_sucursal') await f.db.query(`INSERT INTO bloqueos_temporales
          (negocio_id,personal_id,sucursal_id,servicio_id,inicio_utc,fin_utc,expira_en,titular_hash)
          VALUES(?,?,?,?,'2026-11-09 15:50:00','2026-11-09 16:20:00',?,?)`,
        [f.negocios[0].id, s.personalId, f.negocios[0].sucursales[1].id, s.servicioId, new Date(f.reloj.ahora().getTime() + 300000), 'f'.repeat(64)]);
        if (caso.startsWith('inicio_')) {
          const ahora = new Date(Date.parse(m.cita.inicioUtc) + (caso === 'inicio_pasado' ? 1 : 0));
          await situarSesion(f.db, m.actor, ahora); f.reloj.fijar(ahora);
        }
        if (caso === 'licencia') await f.db.query('UPDATE licencias SET vence_en=? WHERE negocio_id=?', [f.reloj.ahora(), f.negocios[0].id]);
        const antes = await filasManuales(f.db);
        const cupo = jest.spyOn(f.app.get(CupoTelefonicoService), 'contar');
        try {
          const pendiente = m.cambios.cambiar(m.identidad, String(m.cita.id), { estado: 'confirmada', version: 2 });
          if (['libre', 'historico', 'zona_actual', 'cupo'].includes(caso)) {
            expect(await pendiente).toMatchObject({ estado: 'confirmada', version: 3, folio: m.cita.folio });
            const despues = await filasManuales(f.db);
            expect(despues.citas).toEqual(antes.citas.map((c) => c.id === m.cita.id ? { ...c, estado: 'confirmada', version: 3 } : c));
            expect(despues.eventos.at(-1)).toMatchObject({ accion: 'reactivacion', versionResultante: 3 });
            expect((await ocupadas(f, m.cita)).some((o) => o.tipo === 'cita' && o.id === m.cita.id)).toBe(true);
            if (caso === 'cupo') {
              const [fila] = await f.db.query(`SELECT COUNT(*) cantidad FROM citas WHERE negocio_id=? AND sucursal_id=?
                AND telefono_contacto='6141234567' AND inicio_utc>? AND estado<>'cancelada'`, [f.negocios[0].id, s.sucursalId, f.reloj.ahora()]);
              expect(Number(fila.cantidad)).toBe(3);
            }
          } else {
            await expect(pendiente).rejects.toMatchObject({ status: caso === 'licencia' ? 401 : 409 });
            expect(await filasManuales(f.db)).toEqual(antes);
          }
          expect(cupo).not.toHaveBeenCalled();
        } finally { cupo.mockRestore(); }
      });
    });

  it('T068 acceso, IDs ajenos/ausentes y entrada inválida no escriben ni revelan citas', async () => {
    await conAgendaHttp(async (f) => {
      const m = await preparar(f);
      const antes = await filasManuales(f.db);
      for (const actor of f.actores.filter((a) => [Rol.PROFESIONAL, Rol.SUPERADMIN].includes(a.rol))) {
        await expect(m.cambios.cambiar({ sub: actor.id, sesionId: actor.sesionId }, String(m.cita.id), { estado: 'cancelada', version: 1 })).rejects.toMatchObject({ status: 403 });
      }
      for (const id of [String(f.negocios[1].ocupaciones[0]), '4294967295']) {
        await expect(m.cambios.cambiar(m.identidad, id, { estado: 'cancelada', version: 1 })).rejects.toMatchObject({ status: 404 });
      }
      await expect(m.cambios.cambiar(m.identidad, '01', { estado: 'cancelada', version: 1 })).rejects.toMatchObject({ status: 400 });
      await expect(m.cambios.cambiar(m.identidad, String(m.cita.id), { estado: 'cancelada', version: 1, negocioId: 1 })).rejects.toMatchObject({ status: 400 });
      expect(await filasManuales(f.db)).toEqual(antes);
    });
  });

  it.each(['citas', 'eventos_cita'])('T071 falla después del SQL real de %s y revierte estado, versión y evento', async (tabla) => {
    await conAgendaHttp(async (f) => {
      const m = await preparar(f);
      const antes = await filasManuales(f.db);
      const crear = f.db.createQueryRunner.bind(f.db);
      const trazas: jest.SpyInstance[] = [];
      let fallo = false;
      const espia = jest.spyOn(f.db, 'createQueryRunner').mockImplementation((...args) => {
        const runner = crear(...args); const ejecutar = runner.query.bind(runner);
        trazas.push(jest.spyOn(runner, 'query').mockImplementation(async (...consulta) => {
          const resultado = await ejecutar(...consulta);
          if (!fallo && /^(UPDATE|INSERT INTO) /.test(consulta[0]) && consulta[0].split('`')[1] === tabla) {
            fallo = true; throw new Error('Fallo posterior a SQL real');
          }
          return resultado;
        }));
        return runner;
      });
      try {
        await expect(m.cambios.cambiar(m.identidad, String(m.cita.id), { estado: 'cancelada', version: 1 })).rejects.toMatchObject({ status: 500 });
        expect(fallo).toBe(true);
      } finally { espia.mockRestore(); for (const traza of trazas) traza.mockRestore(); }
      expect(await filasManuales(f.db)).toEqual(antes);
      expect(await m.cambios.cambiar(m.identidad, String(m.cita.id), { estado: 'cancelada', version: 1 })).toMatchObject({ estado: 'cancelada', version: 2 });
    });
  });

  it.each(['cancelar', 'reactivar', 'reactivar_inicio_al_esperar', 'reactivar_licencia_al_esperar'])
    ('T071/T072 %s espera al Profesional común y relee el reloj después', async (caso) => {
      await conAgendaHttp(async (f) => {
        const m = await preparar(f);
        const reactivar = caso !== 'cancelar';
        if (reactivar) await m.cambios.cambiar(m.identidad, String(m.cita.id), { estado: 'cancelada', version: 1 });
        if (caso === 'reactivar_inicio_al_esperar') {
          const ahora = new Date(Date.parse(m.cita.inicioUtc) - 1);
          await situarSesion(f.db, m.actor, ahora); f.reloj.fijar(ahora);
        }
        if (caso === 'reactivar_licencia_al_esperar') {
          const ahora = new Date(Date.parse(m.cita.inicioUtc) - 60000);
          await situarSesion(f.db, m.actor, ahora); f.reloj.fijar(ahora);
          await f.db.query('UPDATE licencias SET vence_en=? WHERE negocio_id=?', [new Date(ahora.getTime() + 1), f.negocios[0].id]);
        }
        const antes = await filasManuales(f.db);
        const holder = f.segunda.createQueryRunner();
        const acceso = f.app.get(AccesoOperativoService);
        const resolver = acceso.resolverEnTransaccion.bind(acceso);
        let conexion = 0;
        let traza: jest.SpyInstance | undefined;
        const tablas: string[] = [];
        let pendiente: Promise<unknown> | undefined;
        const observador = jest.spyOn(acceso, 'resolverEnTransaccion').mockImplementation(async (...args) => {
          const ctx = await resolver(...args);
          if (!traza) {
            conexion = Number((await ctx.manager.query('SELECT CONNECTION_ID() id'))[0].id);
            const runner = ctx.manager.queryRunner!;
            const ejecutar = runner.query.bind(runner);
            traza = jest.spyOn(runner, 'query').mockImplementation(async (...consulta) => {
              if (consulta[0].includes('FOR UPDATE')) tablas.push(/FROM `([^`]+)`/.exec(consulta[0])?.[1] ?? 'desconocida');
              return ejecutar(...consulta);
            });
          }
          return ctx;
        });
        try {
          await holder.connect(); await holder.startTransaction('READ COMMITTED');
          await holder.query('SELECT id FROM personal WHERE id=? FOR UPDATE', [m.seleccion.personalId]);
          pendiente = m.cambios.cambiar(m.identidad, String(m.cita.id), { estado: reactivar ? 'confirmada' : 'cancelada', version: reactivar ? 2 : 1 })
            .then((valor) => ({ valor }), (error: unknown) => ({ error }));
          // La conexión rival queda detenida en la misma fila de perfil usada por reservas de cualquier sucursal.
          await esperarBloqueoManual(f.segunda, () => conexion, 'personal');
          if (caso.endsWith('_al_esperar')) f.reloj.avanzar(1);
          await holder.commitTransaction();
          const resultado = await pendiente;
          expect(tablas).toEqual(['usuarios', 'usuarios', 'negocios', 'licencias', 'sucursales', 'servicios', 'personal', 'citas']);
          if (caso.endsWith('_al_esperar')) {
            expect(resultado).toMatchObject({ error: { status: caso === 'reactivar_licencia_al_esperar' ? 401 : 409 } });
            expect(await filasManuales(f.db)).toEqual(antes);
          } else {
            expect(resultado).toMatchObject({ valor: { estado: reactivar ? 'confirmada' : 'cancelada', version: reactivar ? 3 : 2 } });
          }
        } finally {
          if (holder.isTransactionActive) await holder.rollbackTransaction();
          if (pendiente) await pendiente;
          await holder.release(); traza?.mockRestore(); observador.mockRestore();
        }
      });
    });

  it('T068 dos actores y conexiones con versión 1: el segundo relee tras esperar y recibe 409', async () => {
    await conAgendaHttp(async (f) => {
      const m = await preparar(f);
      const otro = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(DataSource).useValue(f.segunda)
        .overrideProvider(RELOJ).useValue(f.reloj).compile();
      const accesoA = f.app.get(AccesoOperativoService);
      const accesoB = otro.get(AccesoOperativoService);
      let conexionA = 0; let conexionB = 0;
      const resolverA = accesoA.resolverEnTransaccion.bind(accesoA);
      const resolverB = accesoB.resolverEnTransaccion.bind(accesoB);
      const espiaA = jest.spyOn(accesoA, 'resolverEnTransaccion').mockImplementation(async (...args) => {
        const ctx = await resolverA(...args); conexionA = Number((await ctx.manager.query('SELECT CONNECTION_ID() id'))[0].id); return ctx;
      });
      const espiaB = jest.spyOn(accesoB, 'resolverEnTransaccion').mockImplementation(async (...args) => {
        const ctx = await resolverB(...args); conexionB = Number((await ctx.manager.query('SELECT CONNECTION_ID() id'))[0].id); return ctx;
      });
      const holder = f.db.createQueryRunner();
      let a: Promise<unknown> | undefined; let b: Promise<unknown> | undefined;
      try {
        const antes = await filasManuales(f.db);
        await holder.connect(); await holder.startTransaction('READ COMMITTED');
        await holder.query('SELECT id FROM personal WHERE id=? FOR UPDATE', [m.seleccion.personalId]);
        a = m.cambios.cambiar(m.identidad, String(m.cita.id), { estado: 'pendiente', version: 1 })
          .then((valor) => ({ valor }), (error: unknown) => ({ error }));
        await esperarBloqueoManual(f.segunda, () => conexionA, 'personal');
        const recepcion = f.actor(Rol.RECEPCIONISTA);
        b = otro.get(CambioEstadoCitaService).cambiar({ sub: recepcion.id, sesionId: recepcion.sesionId }, String(m.cita.id),
          { estado: 'cancelada', version: 1 }).then((valor) => ({ valor }), (error: unknown) => ({ error }));
        await esperarBloqueoManual(f.db, () => conexionB, 'usuarios');
        expect(conexionA).not.toBe(conexionB);
        await holder.commitTransaction();
        expect(await a).toMatchObject({ valor: { estado: 'pendiente', version: 2 } });
        expect(await b).toMatchObject({ error: { status: 409 } });
        const despues = await filasManuales(f.db);
        expect(despues.citas).toEqual(antes.citas.map((c) => c.id === m.cita.id ? { ...c, estado: 'pendiente', version: 2 } : c));
        expect(despues.eventos).toHaveLength(antes.eventos.length + 1);
        expect(despues.eventos.at(-1)).toMatchObject({ actorUsuarioId: m.actor.id, accion: 'cambio_estado', versionResultante: 2 });
      } finally {
        if (holder.isTransactionActive) await holder.rollbackTransaction();
        if (a) await a; if (b) await b;
        await holder.release(); espiaA.mockRestore(); espiaB.mockRestore(); await otro.close();
      }
    });
  });
});
