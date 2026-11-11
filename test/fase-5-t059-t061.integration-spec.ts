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

describe('M4-T059–T061: resolución durable bajo exclusión real', () => {
  const previo = process.env.CITAS_MANUALES_HMAC_SECRET;
  beforeAll(() => { process.env.CITAS_MANUALES_HMAC_SECRET = 'secreto-de-prueba-resolucion-manual-estable'; });
  afterAll(() => { if (previo === undefined) delete process.env.CITAS_MANUALES_HMAC_SECRET; else process.env.CITAS_MANUALES_HMAC_SECRET = previo; });

  it.each([false, true])('T060 cierra ausencia con intento preparado=%s y bloquea preparación/escritura tardías', async (preparado) => {
    await conBaseOperativa(async (db) => {
      const f = await escenario(db);
      try {
        const clave = randomUUID();
        if (preparado) await f.intentos.preparar(f.identidad(), clave, f.nueva);
        const antes = await filas(db);
        expect(await f.registro.resolver(f.identidad(), clave, f.nueva)).toEqual({ estado: 'no_registrado' });
        const terminal = await filas(db);
        expect(terminal.intentos).toHaveLength(1);
        expect(terminal.intentos[0]).toMatchObject({ estado: 'no_registrado', citaId: null, resueltoEn: f.reloj.ahora() });
        expect({ ...terminal, intentos: [] }).toEqual({ ...antes, intentos: [] });
        expect(JSON.stringify(terminal.intentos)).not.toMatch(/Persona independiente|6141234567|Nota privada/);
        expect(await f.registro.resolver(f.identidad(), clave, f.nueva)).toEqual({ estado: 'no_registrado' });
        await expect(f.intentos.preparar(f.identidad(), clave, f.nueva)).rejects.toMatchObject({ status: 409 });
        await expect(f.registro.registrar(f.identidad(), clave, f.nueva)).rejects.toMatchObject({ status: 409 });
        await expect(f.registro.resolver(f.identidad(), clave, { ...f.nueva, notas: 'Otro' })).rejects.toMatchObject({ status: 409 });
        expect(await filas(db)).toEqual(terminal);
      } finally { await f.modulo.close(); }
    });
  });

  it.each(['registrar', 'resolver'] as const)('T059/T060 %s primero retiene la fila y el rival observa su commit', async (primero) => {
    await conBaseOperativa(async (db, segunda) => {
      const f = await escenario(db);
      const moduloB = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(DataSource).useValue(segunda).overrideProvider(RELOJ).useValue(f.reloj).compile();
      const accesoB = moduloB.get(AccesoOperativoService);
      const registroB = moduloB.get(RegistroCitaManualService);
      const crear = db.createQueryRunner.bind(db);
      const trazas: jest.SpyInstance[] = [];
      let abrir!: () => void;
      let retenido!: () => void;
      const barrera = new Promise<void>((r) => { abrir = r; });
      const bloqueado = new Promise<void>((r) => { retenido = r; });
      let a: Promise<unknown> | undefined;
      let b: Promise<unknown> | undefined;
      let conexion = 0;
      let pausa = false;
      const resolverB = accesoB.resolverEnTransaccion.bind(accesoB);
      const observador = jest.spyOn(accesoB, 'resolverEnTransaccion').mockImplementation(async (...args) => {
        const ctx = await resolverB(...args);
        conexion = Number((await ctx.manager.query('SELECT CONNECTION_ID() id'))[0].id);
        return ctx;
      });
      let espia: jest.SpyInstance | undefined;
      try {
        const clave = randomUUID();
        await f.intentos.preparar(f.identidad(), clave, f.nueva);
        const antes = await filas(db);
        // Ejecuta SQL real y pausa al primer participante después de bloquear el intento.
        espia = jest.spyOn(db, 'createQueryRunner').mockImplementation((...args) => {
          const runner = crear(...args);
          const query = runner.query.bind(runner);
          trazas.push(jest.spyOn(runner, 'query').mockImplementation(async (...consulta) => {
            const valor = await query(...consulta);
            if (!pausa && /FROM `intentos_cita_manual`/.test(consulta[0]) && /FOR UPDATE/.test(consulta[0])) {
              pausa = true; retenido(); await barrera;
            }
            return valor;
          }));
          return runner;
        });
        const capturar = (p: Promise<unknown>) => p.then((valor) => ({ valor }), (error: unknown) => ({ error }));
        a = capturar(f.registro[primero](f.identidad(), clave, f.nueva));
        await bloqueado;
        b = capturar(registroB[primero === 'registrar' ? 'resolver' : 'registrar'](f.identidad(), clave, f.nueva));
        const limite = Date.now() + 6000;
        let espera = false;
        while (Date.now() < limite) {
          const filas = await segunda.query(`SELECT ID FROM information_schema.PROCESSLIST
            WHERE ID=? AND COMMAND='Query' AND TIME>=1 AND INFO LIKE '%usuarios%' AND INFO LIKE '%FOR UPDATE'`, [conexion]);
          if (filas.length) { espera = true; break; }
          await new Promise((r) => setTimeout(r, 20));
        }
        expect(espera).toBe(true);
        abrir();
        const resultadoA = await a as { valor: unknown };
        const resultadoB = await b;
        const final = await filas(db);
        if (primero === 'registrar') {
          expect(resultadoB).toEqual({ valor: { estado: 'registrado', resultado: resultadoA.valor } });
          expect(final.citas.length).toBe(antes.citas.length + 1);
          expect(final.eventos.length).toBe(antes.eventos.length + 1);
          expect(final.clientes.length).toBe(antes.clientes.length + 1);
        } else {
          expect(resultadoA).toEqual({ valor: { estado: 'no_registrado' } });
          expect(resultadoB).toMatchObject({ error: { status: 409 } });
          expect({ ...final, intentos: [] }).toEqual({ ...antes, intentos: [] });
        }
      } finally {
        abrir(); if (a) await a; if (b) await b;
        espia?.mockRestore(); observador.mockRestore(); for (const traza of trazas) traza.mockRestore();
        await moduloB.close(); await f.modulo.close();
      }
    });
  });

  it('T059 el timeout real del bloqueo responde 503 y no cierra el intento', async () => {
    await conBaseOperativa(async (db, segunda) => {
      const f = await escenario(db);
      const holder = segunda.createQueryRunner();
      const resolver = f.acceso.resolverEnTransaccion.bind(f.acceso);
      const espia = jest.spyOn(f.acceso, 'resolverEnTransaccion').mockImplementation(async (...args) => {
        const ctx = await resolver(...args);
        // Solo esta conexión de la base desechable usa un segundo para provocar el timeout real.
        await ctx.manager.query('SET SESSION innodb_lock_wait_timeout=1');
        return ctx;
      });
      try {
        const clave = randomUUID();
        await f.intentos.preparar(f.identidad(), clave, f.nueva);
        const antes = await filas(db);
        await holder.connect(); await holder.startTransaction('READ COMMITTED');
        await holder.query('SELECT id FROM usuarios WHERE id=? FOR UPDATE', [f.identidad().sub]);
        await expect(f.registro.resolver(f.identidad(), clave, f.nueva)).rejects.toMatchObject({ status: 503 });
        expect(await filas(db)).toEqual(antes);
        await holder.rollbackTransaction();
        expect(await f.registro.resolver(f.identidad(), clave, f.nueva)).toEqual({ estado: 'no_registrado' });
      } finally {
        if (holder.isTransactionActive) await holder.rollbackTransaction();
        await holder.release(); espia.mockRestore(); await f.modulo.close();
      }
    });
  });

  it('T059 resolver conserva el resultado histórico y exige acceso vigente sin releer oferta/cupo', async () => {
    await conBaseOperativa(async (db) => {
      const f = await escenario(db);
      try {
        const clave = randomUUID();
        await f.intentos.preparar(f.identidad(), clave, f.nueva);
        const resultado = await f.registro.registrar(f.identidad(), clave, f.nueva);
        await db.query('UPDATE servicios SET activo=0,costo=999 WHERE id=?', [f.entrada.servicioId]);
        const antes = await filas(db);
        const motor = jest.spyOn(f.motor, 'revalidarEnTransaccion');
        const cupo = jest.spyOn(f.cupo, 'contar');
        try {
          expect(await f.registro.resolver(f.identidad(), clave, f.nueva)).toEqual({ estado: 'registrado', resultado });
          expect(motor).not.toHaveBeenCalled(); expect(cupo).not.toHaveBeenCalled();
        } finally { motor.mockRestore(); cupo.mockRestore(); }
        expect(await filas(db)).toEqual(antes);
        // La clave de otra cuenta abre su propio cierre terminal, nunca recupera la cita ajena.
        expect(await f.registro.resolver(f.identidad(Rol.RECEPCIONISTA), clave, f.nueva)).toEqual({ estado: 'no_registrado' });
        await db.query('UPDATE sesiones SET revocada_en=? WHERE id=?', [f.reloj.ahora(), f.identidad().sesionId]);
        const revocado = await filas(db);
        await expect(f.registro.resolver(f.identidad(), clave, f.nueva)).rejects.toMatchObject({ status: 401 });
        expect(await filas(db)).toEqual(revocado);
      } finally { await f.modulo.close(); }
    });
  });
});


