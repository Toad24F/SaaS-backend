import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { RELOJ } from '../src/comun/reloj';
import { Rol } from '../src/auth/enums/rol.enum';
import { AccesoOperativoService } from '../src/citas/acceso-operativo.service';
import { IntentosCitaManualService } from '../src/citas/intentos-cita-manual.service';
import { IntentoCitaManual } from '../src/citas/entities/intento-cita-manual.entity';
import { Cliente } from '../src/disponibilidad/entities/cliente.entity';
import { Cita } from '../src/disponibilidad/entities/cita.entity';
import { MotorDisponibilidadService } from '../src/disponibilidad/motor-disponibilidad.service';
import { conBaseOperativa } from './support/operacion-fase-5';
import { crearAccesoOperativo } from './support/acceso-operativo';

async function preparar(db: DataSource) {
  const f = await crearAccesoOperativo(db);
  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(DataSource).useValue(db).overrideProvider(RELOJ).useValue(f.reloj).compile();
  const a = f.negocios[0];
  const [servicio] = await db.query('SELECT id FROM servicios WHERE negocio_id=? AND activo=1', [a.id]);
  // Día futuro con ambas sedes en franjas continuas separadas y todos los componentes reales del motor.
  for (const [i, sede] of a.sucursales.entries()) await db.query(`INSERT INTO horarios_personal
    (negocio_id,personal_id,dia_semana,orden,sucursal_id,inicio_minutos,fin_minutos,activo)
    VALUES(?,?,1,?,?,?,?,1)`, [a.id, a.profesionales[0], i, sede.id, i ? 780 : 480, i ? 1080 : 720]);
  const clientes = await db.getRepository(Cliente).findBy({ negocioId: a.id });
  const identidad = (rol = Rol.ADMIN_NEGOCIO, negocio = 0) => {
    const u = f.actores.find((u) => u.rol === rol && u.negocioId === f.negocios[negocio].id)!;
    return { sub: u.id, sesionId: u.sesionId };
  };
  const entrada = { clienteId: clientes[0].id, sucursalId: a.sucursales[0].id,
    personalId: a.profesionales[0], servicioId: Number(servicio.id), fechaLocal: '2026-11-09', horaInicio: '09:17' };
  return { ...f, modulo, identidad, entrada, clientes, manual: modulo.get(IntentosCitaManualService),
    acceso: modulo.get(AccesoOperativoService), motor: modulo.get(MotorDisponibilidadService) };
}

describe('M4-T049–T052: intentos y selección bajo exclusión real', () => {
  const secretoPrevio = process.env.CITAS_MANUALES_HMAC_SECRET;
  beforeAll(() => { process.env.CITAS_MANUALES_HMAC_SECRET = 'clave-hmac-manual-aislada-exclusivamente-para-tests'; });
  afterAll(() => {
    if (secretoPrevio === undefined) delete process.env.CITAS_MANUALES_HMAC_SECRET;
    else process.env.CITAS_MANUALES_HMAC_SECRET = secretoPrevio;
  });
  it('T049/T050 preparación concurrente repite una fila, no persiste formulario y conflicto conserva la huella', async () => {
    await conBaseOperativa(async (db) => {
      const f = await preparar(db);
      try {
        const clave = randomUUID();
        const [a, b] = await Promise.all([f.manual.preparar(f.identidad(), clave, f.entrada), f.manual.preparar(f.identidad(), clave, f.entrada)]);
        expect(a).toEqual(b);
        expect(a.estado).toBe('preparado');
        const antes = await db.getRepository(IntentoCitaManual).find();
        expect(antes).toHaveLength(1);
        expect(antes[0]).toMatchObject({ actorUsuarioId: f.identidad().sub, negocioId: f.negocios[0].id,
          citaId: null, resueltoEn: null, contenidoHash: expect.stringMatching(/^[a-f0-9]{64}$/) });
        expect(JSON.stringify(antes)).not.toMatch(/6141234567|nombreCompleto|notas|clienteNuevo/);
        await expect(f.manual.preparar(f.identidad(), clave, { ...f.entrada, notas: 'Distinto' })).rejects.toMatchObject({ status: 409 });
        expect(await db.getRepository(IntentoCitaManual).find()).toEqual(antes);
        const otra = await f.manual.preparar(f.identidad(Rol.RECEPCIONISTA), clave, f.entrada);
        expect(otra.id).not.toBe(a.id);
        const bNegocio = f.negocios[1];
        const citaB = await db.getRepository(Cita).findOneByOrFail({ id: bNegocio.ocupaciones[0] });
        const tercerIntento = await f.manual.preparar(f.identidad(Rol.ADMIN_NEGOCIO, 1), clave, { ...f.entrada,
          clienteId: citaB.clienteId, personalId: bNegocio.profesionales[0], servicioId: citaB.servicioId, sucursalId: bNegocio.sucursales[0].id });
        expect(tercerIntento.id).not.toBe(a.id);
      } finally { await f.modulo.close(); }
    });
  });

  it('T048/T049 valida cliente y recursos propios sin sustituir fichas ni permitir roles ajenos', async () => {
    await conBaseOperativa(async (db) => {
      const f = await preparar(db);
      try {
        const ajena = await db.getRepository(Cliente).findOneByOrFail({ negocioId: f.negocios[1].id });
        for (const entrada of [{ ...f.entrada, clienteId: ajena.id },
          { ...f.entrada, sucursalId: f.negocios[1].sucursales[0].id },
          { ...f.entrada, personalId: f.negocios[1].profesionales[0] },
          { ...f.entrada, servicioId: f.negocios[1].servicioInactivoId }]) {
          await expect(f.manual.preparar(f.identidad(), randomUUID(), entrada)).rejects.toMatchObject({ status: 404 });
        }
        await expect(f.manual.preparar(f.identidad(Rol.PROFESIONAL), randomUUID(), f.entrada)).rejects.toMatchObject({ status: 403 });
        expect(await db.getRepository(IntentoCitaManual).count()).toBe(0);
        // Preparar no crea personas nuevas ni citas, aunque su teléfono ya esté en el directorio.
        const { clienteId: _, ...seleccion } = f.entrada;
        const personas = await db.getRepository(Cliente).count();
        const citas = await db.getRepository(Cita).count();
        await f.manual.preparar(f.identidad(), randomUUID(), { ...seleccion,
          clienteNuevo: { nombreCompleto: 'Otra persona', telefono: '6141234567' } });
        expect(await db.getRepository(Cliente).count()).toBe(personas);
        expect(await db.getRepository(Cita).count()).toBe(citas);
      } finally { await f.modulo.close(); }
    });
  });

  it('T050/T051 exige intento propio preparado y huella idéntica antes de ejecutar la colaboración', async () => {
    await conBaseOperativa(async (db) => {
      const f = await preparar(db);
      try {
        const clave = randomUUID();
        const creada = await f.manual.preparar(f.identidad(), clave, f.entrada);
        const guardar = jest.fn();
        await expect(f.manual.conSeleccionRevalidada(f.identidad(), randomUUID(), f.entrada, guardar)).rejects.toMatchObject({ status: 404 });
        await expect(f.manual.conSeleccionRevalidada(f.identidad(Rol.RECEPCIONISTA), clave, f.entrada, guardar)).rejects.toMatchObject({ status: 404 });
        await expect(f.manual.conSeleccionRevalidada(f.identidad(), clave, { ...f.entrada, notas: 'Cambio' }, guardar)).rejects.toMatchObject({ status: 409 });
        await db.getRepository(IntentoCitaManual).update(creada.id, { estado: 'no_registrado', resueltoEn: f.reloj.ahora() });
        await expect(f.manual.preparar(f.identidad(), clave, f.entrada)).rejects.toMatchObject({ status: 409 });
        await expect(f.manual.conSeleccionRevalidada(f.identidad(), clave, f.entrada, guardar)).rejects.toMatchObject({ status: 409 });
        expect(guardar).not.toHaveBeenCalled();
      } finally { await f.modulo.close(); }
    });
  });

  it('T051/T052 usa un manager RC, reloj común, reglas manuales y rollback de la colaboración', async () => {
    await conBaseOperativa(async (db) => {
      const f = await preparar(db);
      try {
        const clave = randomUUID();
        await f.manual.preparar(f.identidad(), clave, f.entrada);
        const motor = jest.spyOn(f.motor, 'revalidarEnTransaccion');
        const transaccion = jest.spyOn(db, 'transaction');
        const citasAntes = await db.getRepository(Cita).count();
        await f.manual.conSeleccionRevalidada(f.identidad(), clave, f.entrada, async (ctx) => {
          expect(ctx.manager.queryRunner?.isTransactionActive).toBe(true);
          expect(ctx.validacion).toMatchObject({ valido: true, modalidad: 'manual' });
          expect(ctx.contacto.telefono).toBe(f.clientes[0].telefono);
          expect(ctx.finOcupacionUtc.getTime()).toBe(ctx.validacion.finUtc.getTime());
          expect(motor.mock.calls[0][0]).toBe(ctx.manager);
          expect(motor.mock.calls[0][1]).toEqual(f.identidad());
          expect(motor.mock.calls[0][2]).toMatchObject({ modalidad: 'manual' });
          expect(motor.mock.calls[0][2]).not.toHaveProperty('apartadoPropio');
          expect(motor.mock.calls[0][3]).toEqual(ctx.ahora);
        });
        expect(transaccion.mock.calls.at(-1)?.[0]).toBe('READ COMMITTED');
        const antes = await db.getRepository(IntentoCitaManual).find();
        await expect(f.manual.conSeleccionRevalidada(f.identidad(), clave, f.entrada, async (ctx) => {
          await ctx.manager.getRepository(IntentoCitaManual).update(ctx.intento.id,
            { estado: 'no_registrado', resueltoEn: ctx.ahora });
          throw new Error('Fallo controlado dentro del callback');
        })).rejects.toMatchObject({ status: 500 });
        expect(await db.getRepository(IntentoCitaManual).find()).toEqual(antes);
        expect(await db.getRepository(Cita).count()).toBe(citasAntes);
      } finally { await f.modulo.close(); }
    });
  });

  const cambios = ['duracion', 'separacion', 'horario', 'oferta', 'asignacion', 'bloqueo', 'ocupacion', 'apartado',
    'cupo', 'cliente', 'licencia', 'sesion', 'inicio_pasado'] as const;
  it.each(cambios)('T052 relee %s confirmado por otra conexión durante la espera real', async (cambio) => {
    await conBaseOperativa(async (db, segunda) => {
      const f = await preparar(db);
      const holder = segunda.createQueryRunner();
      let pendiente: Promise<unknown> | undefined;
      let conexion = 0;
      const resolver = f.acceso.resolverEnTransaccion.bind(f.acceso);
      const espia = jest.spyOn(f.acceso, 'resolverEnTransaccion').mockImplementation(async (...args) => {
        const ctx = await resolver(...args);
        conexion = Number((await ctx.manager.query('SELECT CONNECTION_ID() id'))[0].id);
        return ctx;
      });
      try {
        if (cambio === 'inicio_pasado') {
          // Situar la sesión alrededor del inicio evita que su vencimiento oculte el límite del motor.
          f.reloj.fijar(new Date('2026-11-09T15:16:00Z'));
          await db.query('UPDATE sesiones SET creada_en=?,expira_en=? WHERE id=?', [
            new Date('2026-11-09T14:16:00Z'), new Date('2026-11-10T02:16:00Z'), f.identidad().sesionId]);
        }
        const clave = randomUUID();
        await f.manual.preparar(f.identidad(), clave, f.entrada);
        await holder.connect();
        await holder.startTransaction('READ COMMITTED');
        // La revocación toma primero el usuario, igual que los escritores de identidad;
        // adquirirlo después de negocio invertiría el orden y fabricaría un deadlock del fixture.
        if (cambio === 'sesion') await holder.query('SELECT id FROM usuarios WHERE id=? FOR UPDATE', [f.identidad().sub]);
        else await holder.query('SELECT id FROM negocios WHERE id=? FOR UPDATE', [f.negocios[0].id]);
        let terminado = false;
        const guardar = jest.fn(async (ctx) => ({ duracion: (ctx.validacion.finUtc.getTime() - ctx.validacion.inicioUtc.getTime()) / 60000,
          separacion: ctx.validacion.reglasAplicadas.tiempoEntreCitasMinutos, telefono: ctx.contacto.telefono }));
        pendiente = f.manual.conSeleccionRevalidada(f.identidad(), clave, f.entrada, guardar)
          .then((valor) => ({ valor }), (error: unknown) => ({ error })).finally(() => { terminado = true; });
        // Observar la conexión exacta retenida por FOR UPDATE demuestra espera, no solo intención.
        const limite = Date.now() + 6000;
        let esperando = false;
        while (Date.now() < limite) {
          const filas = await holder.query(`SELECT ID FROM information_schema.PROCESSLIST
            WHERE ID=? AND COMMAND='Query' AND TIME>=1 AND INFO LIKE ? AND INFO LIKE '%FOR UPDATE'`,
          [conexion, cambio === 'sesion' ? '%usuarios%' : '%negocios%']);
          if (filas.length) { esperando = true; break; }
          await new Promise((r) => setTimeout(r, 20));
        }
        expect(esperando).toBe(true);
        expect(terminado).toBe(false);
        const e = f.entrada;
        if (cambio === 'duracion') await holder.query('UPDATE servicios SET duracion_minutos=45 WHERE id=?', [e.servicioId]);
        if (cambio === 'separacion') await holder.query(`INSERT INTO configuracion_agenda
          (negocio_id,modo,tiempo_entre_citas_minutos,anticipacion_minutos,dias_futuros) VALUES(?,'ventana_libre',15,15,60)`, [f.negocios[0].id]);
        if (cambio === 'horario') await holder.query('UPDATE horarios_personal SET fin_minutos=540 WHERE negocio_id=? AND orden=0', [f.negocios[0].id]);
        if (cambio === 'oferta') await holder.query('UPDATE personal_servicios_sucursales SET activo=0 WHERE negocio_id=? AND sucursal_id=?', [f.negocios[0].id, e.sucursalId]);
        if (cambio === 'asignacion') await holder.query('UPDATE personal_sucursales SET activo=0 WHERE negocio_id=? AND sucursal_id=?', [f.negocios[0].id, e.sucursalId]);
        if (cambio === 'cliente') await holder.query("UPDATE clientes SET telefono='6140000000',version=version+1 WHERE id=?", [e.clienteId]);
        if (cambio === 'licencia') await holder.query('UPDATE licencias SET vence_en=? WHERE negocio_id=?', [f.reloj.ahora(), f.negocios[0].id]);
        if (cambio === 'sesion') await holder.query('UPDATE sesiones SET revocada_en=? WHERE id=?', [f.reloj.ahora(), f.identidad().sesionId]);
        if (cambio === 'inicio_pasado') f.reloj.avanzar(60001);
        if (cambio === 'apartado') await holder.query(`INSERT INTO bloqueos_temporales
          (negocio_id,personal_id,sucursal_id,servicio_id,inicio_utc,fin_utc,expira_en,titular_hash,separacion_minutos,fin_ocupacion_utc,modo_concesion,version_reglas)
          VALUES(?,?,?,?,'2026-11-09 15:00:00','2026-11-09 15:10:00',?,?,15,'2026-11-09 15:25:00','ventana_libre',1)`,
        [f.negocios[0].id, e.personalId, f.negocios[0].sucursales[1].id, e.servicioId,
          new Date(f.reloj.ahora().getTime() + 300000), 'a'.repeat(64)]);
        if (cambio === 'bloqueo') await holder.query(`INSERT INTO bloqueos_horario
          (negocio_id,personal_id,sucursal_id,creador_usuario_id,tipo,fecha_inicio,fecha_fin,inicio_minutos,fin_minutos,motivo)
          VALUES(?,?,?,?,'emergencia','2026-11-09','2026-11-09',540,600,'Prueba')`,
        [f.negocios[0].id, e.personalId, e.sucursalId, f.identidad().sub]);
        if (cambio === 'ocupacion' || cambio === 'cupo') {
          for (let i = 0; i < (cambio === 'cupo' ? 2 : 1); i++) await holder.query(`INSERT INTO citas
            (negocio_id,sucursal_id,personal_id,servicio_id,cliente_id,inicio_utc,fin_utc,zona_horaria_reserva,folio,telefono_contacto)
            VALUES(?,?,?,?,?, ?,?,'America/Chihuahua',?,?)`, [f.negocios[0].id, e.sucursalId,
            cambio === 'cupo' ? f.negocios[0].profesionales[1] : e.personalId, e.servicioId, e.clienteId,
            cambio === 'cupo' ? `2026-11-09 ${18 + i}:00:00` : '2026-11-09 15:20:00',
            cambio === 'cupo' ? `2026-11-09 ${18 + i}:30:00` : '2026-11-09 15:50:00', `M4-CAMBIO-${i}`, f.clientes[0].telefono]);
        }
        await holder.commitTransaction();
        const resultado = await pendiente;
        if (['duracion', 'separacion', 'cliente'].includes(cambio)) {
          expect(resultado).toMatchObject({ valor: { duracion: cambio === 'duracion' ? 45 : 30,
            separacion: cambio === 'separacion' ? 15 : 0, telefono: cambio === 'cliente' ? '6140000000' : f.clientes[0].telefono } });
          expect(guardar).toHaveBeenCalledTimes(1);
        } else {
          expect(resultado).toMatchObject({ error: { status: ['licencia', 'sesion'].includes(cambio) ? 401 : 409 } });
          expect(guardar).not.toHaveBeenCalled();
        }
        expect((await db.getRepository(IntentoCitaManual).findOneByOrFail({ clave })).estado).toBe('preparado');
      } finally {
        if (holder.isTransactionActive) await holder.rollbackTransaction();
        if (pendiente) await pendiente;
        await holder.release();
        espia.mockRestore();
        await f.modulo.close();
      }
    });
  });

  it.each([0, 1])('T051 sucursal %s espera la misma fila del Profesional y respeta todo el orden de bloqueos', async (indice) => {
    await conBaseOperativa(async (db, segunda) => {
      const f = await preparar(db);
      const holder = segunda.createQueryRunner();
      let pendiente: Promise<unknown> | undefined;
      let conexion = 0;
      const sql: string[] = [];
      let traza: jest.SpyInstance | undefined;
      const resolver = f.acceso.resolverEnTransaccion.bind(f.acceso);
      let acceso: jest.SpyInstance | undefined;
      try {
        const entrada = { ...f.entrada, sucursalId: f.negocios[0].sucursales[indice].id, horaInicio: indice ? '13:17' : '09:17' };
        const clave = randomUUID();
        await f.manual.preparar(f.identidad(), clave, entrada);
        await holder.connect();
        await holder.startTransaction('READ COMMITTED');
        await holder.query('SELECT id FROM personal WHERE id=? FOR UPDATE', [entrada.personalId]);
        acceso = jest.spyOn(f.acceso, 'resolverEnTransaccion').mockImplementation(async (...args) => {
          const ctx = await resolver(...args);
          if (!traza) {
            conexion = Number((await ctx.manager.query('SELECT CONNECTION_ID() id'))[0].id);
            const runner = ctx.manager.queryRunner!;
            const ejecutar = runner.query.bind(runner);
            traza = jest.spyOn(runner, 'query').mockImplementation(async (...consulta) => {
              if (/FOR UPDATE|LOCK IN SHARE MODE/i.test(consulta[0])) sql.push(consulta[0]);
              return ejecutar(...consulta);
            });
          }
          return ctx;
        });
        const guardar = jest.fn(async () => 'validada');
        pendiente = f.manual.conSeleccionRevalidada(f.identidad(), clave, entrada, guardar)
          .then((valor) => ({ valor }), (error: unknown) => ({ error }));
        const limite = Date.now() + 6000;
        let esperando = false;
        while (Date.now() < limite) {
          const filas = await holder.query(`SELECT ID FROM information_schema.PROCESSLIST
            WHERE ID=? AND COMMAND='Query' AND TIME>=1 AND INFO LIKE '%FROM %personal%' AND INFO LIKE '%FOR UPDATE'`, [conexion]);
          if (filas.length) { esperando = true; break; }
          await new Promise((r) => setTimeout(r, 20));
        }
        expect(esperando).toBe(true);
        expect(guardar).not.toHaveBeenCalled();
        await holder.commitTransaction();
        expect(await pendiente).toEqual({ valor: 'validada' });
        expect(guardar).toHaveBeenCalledTimes(1);
        expect(sql.map((q) => /FROM `([^`]+)`/.exec(q)?.[1])).toEqual([
          'usuarios', 'usuarios', 'intentos_cita_manual', 'negocios', 'licencias', 'sucursales', 'servicios', 'personal',
        ]);
      } finally {
        if (holder.isTransactionActive) await holder.rollbackTransaction();
        if (pendiente) await pendiente;
        await holder.release();
        traza?.mockRestore();
        acceso?.mockRestore();
        await f.modulo.close();
      }
    });
  });

  it('T048/T052 cliente nuevo usa modalidad manual aun con horizonte cero, anticipación y agenda compacta', async () => {
    await conBaseOperativa(async (db) => {
      const f = await preparar(db);
      try {
        await db.query(`INSERT INTO configuracion_agenda
          (negocio_id,modo,tiempo_entre_citas_minutos,anticipacion_minutos,dias_futuros)
          VALUES(?,'agenda_compacta',5,10000,0)`, [f.negocios[0].id]);
        const { clienteId: _, ...seleccion } = f.entrada;
        const entrada = { ...seleccion, clienteNuevo: { nombreCompleto: 'Persona nueva', telefono: '+52 614-000-9999' } };
        const clave = randomUUID();
        await f.manual.preparar(f.identidad(Rol.RECEPCIONISTA), clave, entrada);
        const antes = await db.getRepository(Cliente).count();
        const resultado = await f.manual.conSeleccionRevalidada(f.identidad(Rol.RECEPCIONISTA), clave, entrada, async (ctx) => ({
          valido: ctx.validacion.valido, telefono: ctx.contacto.telefono,
          margen: ctx.finOcupacionUtc.getTime() - ctx.validacion.finUtc.getTime(),
        }));
        expect(resultado).toEqual({ valido: true, telefono: '6140009999', margen: 5 * 60000 });
        expect(await db.getRepository(Cliente).count()).toBe(antes);
      } finally { await f.modulo.close(); }
    });
  });
});
