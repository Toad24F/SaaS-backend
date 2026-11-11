import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { RELOJ } from '../src/comun/reloj';
import { Rol } from '../src/auth/enums/rol.enum';
import { AccesoOperativoService } from '../src/citas/acceso-operativo.service';
import { IntentosCitaManualService } from '../src/citas/intentos-cita-manual.service';
import { RegistroCitaManualService } from '../src/citas/registro-cita-manual.service';
import { IntentoCitaManual } from '../src/citas/entities/intento-cita-manual.entity';
import { EventoCita } from '../src/citas/entities/evento-cita.entity';
import { EventoAuditoria } from '../src/auditoria/entities/evento-auditoria.entity';
import { Cliente } from '../src/disponibilidad/entities/cliente.entity';
import { Cita } from '../src/disponibilidad/entities/cita.entity';
import { MotorDisponibilidadService } from '../src/disponibilidad/motor-disponibilidad.service';
import { CupoTelefonicoService } from '../src/reservas-publicas/cupo-telefonico.service';
import { conBaseOperativa } from './support/operacion-fase-5';
import { crearAccesoOperativo } from './support/acceso-operativo';

async function escenario(db: DataSource) {
  const f = await crearAccesoOperativo(db);
  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(DataSource).useValue(db).overrideProvider(RELOJ).useValue(f.reloj).compile();
  const a = f.negocios[0];
  const cita = await db.getRepository(Cita).findOneByOrFail({ id: a.ocupaciones[0] });
  await db.query(`INSERT INTO horarios_personal
    (negocio_id,personal_id,dia_semana,orden,sucursal_id,inicio_minutos,fin_minutos,activo)
    VALUES(?,?,1,0,?,480,720,1)`, [a.id, a.profesionales[0], a.sucursales[0].id]);
  const identidad = (rol = Rol.ADMIN_NEGOCIO) => {
    const u = f.actores.find((u) => u.rol === rol && u.negocioId === a.id)!;
    return { sub: u.id, sesionId: u.sesionId };
  };
  const entrada = { clienteId: cita.clienteId, sucursalId: a.sucursales[0].id, personalId: a.profesionales[0],
    servicioId: cita.servicioId, fechaLocal: '2026-11-09', horaInicio: '09:17', notas: 'Nota privada de atención' };
  const { clienteId: _, ...seleccion } = entrada;
  const nueva = { ...seleccion, clienteNuevo: { nombreCompleto: 'Persona independiente', telefono: '+52 614-123-4567' } };
  return { ...f, modulo, identidad, entrada, nueva, intentos: modulo.get(IntentosCitaManualService),
    registro: modulo.get(RegistroCitaManualService), acceso: modulo.get(AccesoOperativoService),
    motor: modulo.get(MotorDisponibilidadService), cupo: modulo.get(CupoTelefonicoService) };
}

async function filas(db: DataSource) {
  return { clientes: await db.getRepository(Cliente).find({ order: { id: 'ASC' } }),
    citas: await db.getRepository(Cita).find({ order: { id: 'ASC' } }),
    eventos: await db.getRepository(EventoCita).find({ order: { id: 'ASC' } }),
    auditoria: await db.getRepository(EventoAuditoria).find({ order: { id: 'ASC' } }),
    intentos: await db.getRepository(IntentoCitaManual).find({ order: { id: 'ASC' } }) };
}

describe('M4-T053–T058: registro manual real y repetición durable', () => {
  const secretoAnterior = process.env.CITAS_MANUALES_HMAC_SECRET;
  beforeAll(() => { process.env.CITAS_MANUALES_HMAC_SECRET = 'clave-hmac-aislada-del-escritor-manual-para-tests'; });
  afterAll(() => {
    if (secretoAnterior === undefined) delete process.env.CITAS_MANUALES_HMAC_SECRET;
    else process.env.CITAS_MANUALES_HMAC_SECRET = secretoAnterior;
  });

  it.each([Rol.ADMIN_NEGOCIO, Rol.RECEPCIONISTA])('T053–T057 %s registra ficha elegida, costo y nombres vigentes con un evento en el mismo commit', async (rol) => {
    await conBaseOperativa(async (db) => {
      const f = await escenario(db);
      try {
        const clave = randomUUID();
        const actor = f.identidad(rol);
        await f.intentos.preparar(actor, clave, f.entrada);
        const clientesAntes = await db.getRepository(Cliente).find();
        // La preparación no congela catálogo ni ficha: la copia se toma al registrar.
        await db.query("UPDATE servicios SET costo=145.75,duracion_minutos=45,nombre='Servicio vigente' WHERE id=?", [f.entrada.servicioId]);
        await db.query("UPDATE sucursales SET nombre='Sede vigente' WHERE id=?", [f.entrada.sucursalId]);
        await db.query("UPDATE usuarios SET nombre='Profesional vigente' WHERE id=?", [f.entrada.personalId]);
        await db.query("UPDATE negocios SET nombre='Negocio vigente' WHERE id=?", [f.negocios[0].id]);
        await db.query("UPDATE clientes SET nombre_completo='Contacto vigente',telefono='6140009999',version=2 WHERE id=?", [f.entrada.clienteId]);
        await db.query(`INSERT INTO configuracion_agenda(negocio_id,modo,tiempo_entre_citas_minutos,anticipacion_minutos,dias_futuros)
          VALUES(?,'ventana_libre',10,15,60)`, [f.negocios[0].id]);
        const respuesta = await f.registro.registrarConMeta(actor, clave, f.entrada);
        expect(respuesta.repetida).toBe(false);
        const resultado = respuesta.resultado;
        expect(resultado).toMatchObject({ clienteId: f.entrada.clienteId, estado: 'confirmada', origen: 'manual', version: 1,
          inicioUtc: '2026-11-09T15:17:00.000Z', finUtc: '2026-11-09T16:02:00.000Z', finOcupacionUtc: '2026-11-09T16:12:00.000Z',
          separacionMinutos: 10, zonaHoraria: 'America/Chihuahua', costoAceptado: '145.75',
          nombreNegocio: 'Negocio vigente', nombreSucursal: 'Sede vigente', nombreServicio: 'Servicio vigente',
          nombreProfesional: 'Profesional vigente', nombreContacto: 'Contacto vigente', telefonoContacto: '6140009999',
          motivoConsulta: f.entrada.notas });
        expect(resultado.folio).toMatch(/^M-[A-F0-9]{18}$/);
        const cita = await db.getRepository(Cita).findOneByOrFail({ id: resultado.id });
        expect(cita).toMatchObject({ negocioId: f.negocios[0].id, clienteId: f.entrada.clienteId,
          creadoEn: f.reloj.ahora(), apartadoOrigenId: null, costoAceptado: '145.75', estado: 'confirmada' });
        expect(await db.getRepository(Cliente).count()).toBe(clientesAntes.length);
        const eventos = await db.getRepository(EventoCita).findBy({ citaId: cita.id });
        expect(eventos).toHaveLength(1);
        expect(eventos[0]).toMatchObject({ negocioId: cita.negocioId, actorUsuarioId: actor.sub, sesionPublicaId: null,
          accion: 'alta', versionResultante: 1, ocurridoEn: f.reloj.ahora(), valoresAntes: null, motivo: null,
          valoresDespues: { estado: 'confirmada', origen: 'manual', folio: cita.folio,
            inicioUtc: resultado.inicioUtc, finUtc: resultado.finUtc, finOcupacionUtc: resultado.finOcupacionUtc, costoAceptado: '145.75' } });
        expect(JSON.stringify(eventos)).not.toMatch(/Contacto vigente|6140009999|Nota privada|contenidoHash|sesionId|password/);
        const intento = await db.getRepository(IntentoCitaManual).findOneByOrFail({ clave });
        expect(intento).toMatchObject({ estado: 'registrado', citaId: cita.id, resueltoEn: f.reloj.ahora() });
        expect(JSON.stringify(intento)).not.toMatch(/Contacto vigente|6140009999|Nota privada/);
      } finally { await f.modulo.close(); }
    });
  });

  it('T054/T056 cliente nuevo no fusiona teléfono ni nombre; su auditoría y cita se guardan juntos', async () => {
    await conBaseOperativa(async (db) => {
      const f = await escenario(db);
      try {
        const ficha = await db.getRepository(Cliente).findOneByOrFail({ id: f.entrada.clienteId });
        const entrada = { ...f.nueva, clienteNuevo: { nombreCompleto: ficha.nombreCompleto, telefono: ficha.telefono } };
        const clave = randomUUID();
        await f.intentos.preparar(f.identidad(), clave, entrada);
        const antes = await db.getRepository(Cliente).find();
        const resultado = await f.registro.registrar(f.identidad(), clave, entrada);
        expect(resultado.clienteId).not.toBe(ficha.id);
        expect(await db.getRepository(Cliente).count()).toBe(antes.length + 1);
        expect(await db.getRepository(Cliente).findBy({ id: ficha.id })).toEqual([ficha]);
        expect(await db.getRepository(Cliente).findOneByOrFail({ id: resultado.clienteId })).toMatchObject({
          negocioId: f.negocios[0].id, version: 1, nombreCompleto: ficha.nombreCompleto, telefono: ficha.telefono, creadoEn: f.reloj.ahora() });
        const auditoria = await db.getRepository(EventoAuditoria).findBy({ recursoTipo: 'cliente', recursoId: resultado.clienteId });
        expect(auditoria).toHaveLength(1);
        expect(auditoria[0]).toMatchObject({ accion: 'cliente_creado', actorUsuarioId: f.identidad().sub, ocurridoEn: f.reloj.ahora() });
        expect(JSON.stringify(auditoria)).not.toContain(ficha.telefono);
      } finally { await f.modulo.close(); }
    });
  });

  it('T053/T055 admite costo cero sin perder precisión decimal ni aceptar costo del navegador', async () => {
    await conBaseOperativa(async (db) => {
      const f = await escenario(db);
      try {
        const clave = randomUUID();
        await f.intentos.preparar(f.identidad(), clave, f.entrada);
        await db.query('UPDATE servicios SET costo=0 WHERE id=?', [f.entrada.servicioId]);
        await expect(f.registro.registrar(f.identidad(), clave, { ...f.entrada, costo: '1.00' })).rejects.toMatchObject({ status: 400 });
        expect((await f.registro.registrar(f.identidad(), clave, f.entrada)).costoAceptado).toBe('0.00');
      } finally { await f.modulo.close(); }
    });
  });

  it('T055/T058 dos conexiones con la misma clave confirman una sola cita, ficha y evento', async () => {
    await conBaseOperativa(async (db, segunda) => {
      const f = await escenario(db);
      const otro = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(DataSource).useValue(segunda)
        .overrideProvider(RELOJ).useValue(f.reloj).compile();
      try {
        const clave = randomUUID();
        await f.intentos.preparar(f.identidad(), clave, f.nueva);
        const antes = await filas(db);
        const resultados = await Promise.all([
          f.registro.registrarConMeta(f.identidad(), clave, f.nueva),
          otro.get(RegistroCitaManualService).registrarConMeta(f.identidad(), clave, f.nueva),
        ]);
        expect(resultados[0].resultado).toEqual(resultados[1].resultado);
        expect(resultados.map((r) => r.repetida).sort()).toEqual([false, true]);
        const despues = await filas(db);
        expect(despues.citas).toHaveLength(antes.citas.length + 1);
        expect(despues.clientes).toHaveLength(antes.clientes.length + 1);
        expect(despues.eventos).toHaveLength(antes.eventos.length + 1);
        expect(despues.auditoria).toHaveLength(antes.auditoria.length + 1);
      } finally { await otro.close(); await f.modulo.close(); }
    });
  });

  it('T058 repite el resultado persistido sin revalidar oferta/cupo ni copiar contacto o catálogo corregidos', async () => {
    await conBaseOperativa(async (db) => {
      const f = await escenario(db);
      try {
        const clave = randomUUID();
        await f.intentos.preparar(f.identidad(), clave, f.entrada);
        const original = await f.registro.registrar(f.identidad(), clave, f.entrada);
        await db.query("UPDATE servicios SET costo=999,duracion_minutos=90,activo=0,nombre='Otro servicio' WHERE id=?", [f.entrada.servicioId]);
        await db.query("UPDATE clientes SET nombre_completo='Otro nombre',telefono='6140000000',version=2 WHERE id=?", [f.entrada.clienteId]);
        const antes = await filas(db);
        const motor = jest.spyOn(f.motor, 'revalidarEnTransaccion');
        const cupo = jest.spyOn(f.cupo, 'contar');
        try {
          const repetida = await f.registro.registrarConMeta(f.identidad(), clave, f.entrada);
          expect(repetida).toEqual({ resultado: original, repetida: true });
          expect(motor).not.toHaveBeenCalled();
          expect(cupo).not.toHaveBeenCalled();
          expect(await filas(db)).toEqual(antes);
          await expect(f.registro.registrar(f.identidad(), clave, { ...f.entrada, notas: 'Contenido diferente' })).rejects.toMatchObject({ status: 409 });
          expect(await filas(db)).toEqual(antes);
        } finally { motor.mockRestore(); cupo.mockRestore(); }
      } finally { await f.modulo.close(); }
    });
  });

  it('T055/T058 respeta el cupo por teléfono y sucursal; repetir el segundo registro no consume un tercero', async () => {
    await conBaseOperativa(async (db) => {
      const f = await escenario(db);
      try {
        const primera = randomUUID();
        await f.intentos.preparar(f.identidad(), primera, f.nueva);
        const a = await f.registro.registrar(f.identidad(), primera, f.nueva);
        const segunda = randomUUID();
        const seleccion = { ...f.entrada, horaInicio: '10:17' };
        await f.intentos.preparar(f.identidad(), segunda, seleccion);
        const b = await f.registro.registrar(f.identidad(), segunda, seleccion);
        expect(b.folio).not.toBe(a.folio);
        expect(b.clienteId).not.toBe(a.clienteId);
        expect(await f.registro.registrar(f.identidad(), segunda, seleccion)).toEqual(b);
        const tercera = randomUUID();
        const nueva = { ...f.nueva, horaInicio: '11:17' };
        await f.intentos.preparar(f.identidad(), tercera, nueva);
        const antes = await filas(db);
        await expect(f.registro.registrar(f.identidad(), tercera, nueva)).rejects.toMatchObject({ status: 409 });
        expect(await filas(db)).toEqual(antes);
        expect(antes.intentos.find((i) => i.clave === tercera)?.estado).toBe('preparado');
      } finally { await f.modulo.close(); }
    });
  });

  it('T054/T058 deniega intento ausente, otro actor, Profesional y resultado terminal sin filas parciales', async () => {
    await conBaseOperativa(async (db) => {
      const f = await escenario(db);
      try {
        const clave = randomUUID();
        const intento = await f.intentos.preparar(f.identidad(), clave, f.nueva);
        const antes = await filas(db);
        await expect(f.registro.registrar(f.identidad(), randomUUID(), f.nueva)).rejects.toMatchObject({ status: 404 });
        await expect(f.registro.registrar(f.identidad(Rol.RECEPCIONISTA), clave, f.nueva)).rejects.toMatchObject({ status: 404 });
        await expect(f.registro.registrar(f.identidad(Rol.PROFESIONAL), clave, f.nueva)).rejects.toMatchObject({ status: 403 });
        expect(await filas(db)).toEqual(antes);
        await db.getRepository(IntentoCitaManual).update(intento.id, { estado: 'no_registrado', resueltoEn: f.reloj.ahora() });
        const terminal = await filas(db);
        await expect(f.registro.registrar(f.identidad(), clave, f.nueva)).rejects.toMatchObject({ status: 409 });
        expect(await filas(db)).toEqual(terminal);
      } finally { await f.modulo.close(); }
    });
  });

  it('T055 conserva la separación protegida y admite el extremo exactamente contiguo', async () => {
    await conBaseOperativa(async (db) => {
      const f = await escenario(db);
      try {
        await db.query(`INSERT INTO configuracion_agenda(negocio_id,modo,tiempo_entre_citas_minutos,anticipacion_minutos,dias_futuros)
          VALUES(?,'ventana_libre',10,15,60)`, [f.negocios[0].id]);
        const primera = randomUUID();
        await f.intentos.preparar(f.identidad(), primera, f.nueva);
        const original = await f.registro.registrar(f.identidad(), primera, f.nueva);
        const invade = { ...f.nueva, horaInicio: '09:50' };
        const clave = randomUUID();
        await f.intentos.preparar(f.identidad(), clave, invade);
        const antes = await filas(db);
        await expect(f.registro.registrar(f.identidad(), clave, invade)).rejects.toMatchObject({ status: 409 });
        expect(await filas(db)).toEqual(antes);
        const contigua = { ...f.entrada, horaInicio: '09:57' };
        const claveContigua = randomUUID();
        await f.intentos.preparar(f.identidad(), claveContigua, contigua);
        const siguiente = await f.registro.registrar(f.identidad(), claveContigua, contigua);
        expect(siguiente.inicioUtc).toBe(original.finOcupacionUtc);
        expect(siguiente.folio).not.toBe(original.folio);
      } finally { await f.modulo.close(); }
    });
  });

  it.each(['sesion', 'licencia'])('T058 la repetición privada sigue exigiendo %s vigente', async (recurso) => {
    await conBaseOperativa(async (db) => {
      const f = await escenario(db);
      try {
        const clave = randomUUID();
        await f.intentos.preparar(f.identidad(), clave, f.entrada);
        await f.registro.registrar(f.identidad(), clave, f.entrada);
        if (recurso === 'sesion') await db.query('UPDATE sesiones SET revocada_en=? WHERE id=?', [f.reloj.ahora(), f.identidad().sesionId]);
        else await db.query('UPDATE licencias SET vence_en=? WHERE negocio_id=?', [f.reloj.ahora(), f.negocios[0].id]);
        const antes = await filas(db);
        await expect(f.registro.registrar(f.identidad(), clave, f.entrada)).rejects.toMatchObject({ status: 401 });
        expect(await filas(db)).toEqual(antes);
      } finally { await f.modulo.close(); }
    });
  });

  it.each(['clientes', 'eventos_auditoria', 'citas', 'eventos_cita', 'intentos_cita_manual'])
    ('T057 revierte todo si falla después de escribir %s y permite reintentar la clave preparada', async (tabla) => {
      await conBaseOperativa(async (db) => {
        const f = await escenario(db);
        const trazas: jest.SpyInstance[] = [];
        let espia: jest.SpyInstance | undefined;
        try {
          const clave = randomUUID();
          await f.intentos.preparar(f.identidad(), clave, f.nueva);
          const antes = await filas(db);
          const crearRunner = db.createQueryRunner.bind(db);
          let fallo = false;
          // Ejecutar primero el SQL real demuestra que también se revierten las filas ya escritas.
          espia = jest.spyOn(db, 'createQueryRunner').mockImplementation((...args) => {
            const runner = crearRunner(...args);
            const ejecutar = runner.query.bind(runner);
            trazas.push(jest.spyOn(runner, 'query').mockImplementation(async (...consulta) => {
              const resultado = await ejecutar(...consulta);
              const escritura = /^(INSERT INTO|UPDATE) /i.test(consulta[0]);
              const destino = consulta[0].split('`')[1];
              if (!fallo && escritura && destino === tabla) {
                fallo = true;
                throw new Error('Fallo controlado después de escritura real');
              }
              return resultado;
            }));
            return runner;
          });
          await expect(f.registro.registrar(f.identidad(), clave, f.nueva)).rejects.toMatchObject({ status: 500 });
          expect(fallo).toBe(true);
          espia.mockRestore();
          for (const traza of trazas) traza.mockRestore();
          expect(await filas(db)).toEqual(antes);
          const resultado = await f.registro.registrar(f.identidad(), clave, f.nueva);
          expect((await db.getRepository(IntentoCitaManual).findOneByOrFail({ clave })).citaId).toBe(resultado.id);
          expect(await db.getRepository(EventoCita).countBy({ citaId: resultado.id })).toBe(1);
        } finally {
          espia?.mockRestore();
          for (const traza of trazas) traza.mockRestore();
          await f.modulo.close();
        }
      });
    });

  it('T053 copia el costo que confirma otra conexión mientras el registro espera el bloqueo común', async () => {
    await conBaseOperativa(async (db, segunda) => {
      const f = await escenario(db);
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
        const clave = randomUUID();
        await f.intentos.preparar(f.identidad(), clave, f.entrada);
        await holder.connect();
        await holder.startTransaction('READ COMMITTED');
        await holder.query('SELECT id FROM negocios WHERE id=? FOR UPDATE', [f.negocios[0].id]);
        pendiente = f.registro.registrar(f.identidad(), clave, f.entrada).then((valor) => ({ valor }), (error: unknown) => ({ error }));
        const limite = Date.now() + 6000;
        let esperando = false;
        while (Date.now() < limite) {
          const filas = await holder.query(`SELECT ID FROM information_schema.PROCESSLIST
            WHERE ID=? AND COMMAND='Query' AND TIME>=1 AND INFO LIKE '%negocios%' AND INFO LIKE '%FOR UPDATE'`, [conexion]);
          if (filas.length) { esperando = true; break; }
          await new Promise((r) => setTimeout(r, 20));
        }
        expect(esperando).toBe(true);
        await holder.query('UPDATE servicios SET costo=195.35 WHERE id=?', [f.entrada.servicioId]);
        await holder.commitTransaction();
        expect(await pendiente).toMatchObject({ valor: { costoAceptado: '195.35' } });
        const intento = await db.getRepository(IntentoCitaManual).findOneByOrFail({ clave });
        expect(await db.getRepository(Cita).findOneByOrFail({ id: intento.citaId! })).toMatchObject({ costoAceptado: '195.35' });
      } finally {
        if (holder.isTransactionActive) await holder.rollbackTransaction();
        if (pendiente) await pendiente;
        await holder.release(); espia.mockRestore(); await f.modulo.close();
      }
    });
  });
});
