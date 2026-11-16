import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { Rol } from '../src/auth/enums/rol.enum';
import { Cliente } from '../src/disponibilidad/entities/cliente.entity';
import { Cita } from '../src/disponibilidad/entities/cita.entity';
import { EventoAuditoria } from '../src/auditoria/entities/evento-auditoria.entity';
import { Sesion } from '../src/auth/entities/sesion.entity';
import { ClientesService } from '../src/clientes/clientes.service';
import { AppModule } from '../src/app.module';
import { RELOJ } from '../src/comun/reloj';
import { conBaseOperativa } from './support/operacion-fase-5';
import { crearClientesOperativos } from './support/clientes-operativos';
import request from 'supertest';

describe('M4-T038–T042: fichas propias, versión y auditoría atómica', () => {
  it('T038 busca nombre/teléfono normalizado, conserva fichas compartidas y orden estable por nombre/ID', async () => {
    await conBaseOperativa(async (db, segunda) => {
      const f = await crearClientesOperativos(db, segunda);
      const actor = f.identidad(Rol.ADMIN_NEGOCIO);
      const a = await f.clientes.crear(actor, { nombreCompleto: 'Ana %_!\\', telefono: '6141234567' });
      const b = await f.clientes.crear(actor, { nombreCompleto: 'Ana %_!\\', telefono: '+52 614-123-4567' });
      expect(a.id).not.toBe(b.id);
      const primera = await f.clientes.listar(actor, { busqueda: '%_!\\', limite: '1' });
      const siguiente = await f.clientes.listar(actor, { busqueda: '%_!\\', limite: '1', pagina: '2' });
      expect(primera.clientes.map((c) => c.id)).toEqual([a.id]);
      expect(siguiente.clientes.map((c) => c.id)).toEqual([b.id]);
      expect(primera.hayMas).toBe(true);
      expect(siguiente.hayMas).toBe(false);
      const telefono = await f.clientes.listar(actor, { busqueda: '+52 614-123-4567' });
      expect(telefono.clientes).toHaveLength(4);
      expect(telefono.clientes.every((c) => c.negocioId === f.negocios[0].id)).toBe(true);
      expect((await f.clientes.listar(actor, { busqueda: "' OR 1=1 --" })).clientes).toEqual([]);
    });
  });

  it('T039 consulta ficha e historial solo por ID propio, sin confundir teléfono compartido ni estados', async () => {
    await conBaseOperativa(async (db, segunda) => {
      const f = await crearClientesOperativos(db, segunda);
      const actor = f.identidad(Rol.RECEPCIONISTA);
      const fichas = await db.getRepository(Cliente).findBy({ negocioId: f.negocios[0].id });
      const cita = await db.getRepository(Cita).findOneByOrFail({ id: f.negocios[0].ocupaciones[0] });
      const propia = await f.clientes.consultar(actor, String(cita.clienteId), {});
      expect(propia.telefono).toBe('6141234567');
      const historial = await f.clientes.historialCitas(actor, String(cita.clienteId), { limite: '2' });
      expect(historial.citas).toHaveLength(2);
      expect(historial.hayMas).toBe(true);
      const total = await f.clientes.historialCitas(actor, String(cita.clienteId), {});
      expect(new Set(total.citas.map((c) => c.estado)).size).toBe(5);
      expect(total.citas.every((c) => c.clienteId === cita.clienteId && c.negocioId === f.negocios[0].id)).toBe(true);
      const otra = fichas.find((c) => c.id !== cita.clienteId)!;
      expect((await f.clientes.historialCitas(actor, String(otra.id), {})).citas).toEqual([]);
      for (const id of [(await db.getRepository(Cliente).findOneByOrFail({ negocioId: f.negocios[1].id })).id, 999999]) {
        await expect(f.clientes.consultar(actor, String(id), {})).rejects.toMatchObject({ status: 404, message: 'Recurso no disponible.' });
        await expect(f.clientes.historialCitas(actor, String(id), {})).rejects.toMatchObject({ status: 404 });
      }
    });
  });

  it('T040/T042 alta independiente crea una ficha y evento por commit sin duplicar contacto en auditoría', async () => {
    await conBaseOperativa(async (db, segunda) => {
      const f = await crearClientesOperativos(db, segunda);
      const actor = f.identidad(Rol.ADMIN_NEGOCIO);
      const citasAntes = await db.getRepository(Cita).count();
      const a = await f.clientes.crear(actor, { nombreCompleto: '  Persona independiente  ', telefono: '+52 614-555-0199' });
      expect(a).toMatchObject({ nombreCompleto: 'Persona independiente', telefono: '6145550199', version: 1, negocioId: f.negocios[0].id });
      expect(await db.getRepository(Cita).count()).toBe(citasAntes);
      const eventos = await db.getRepository(EventoAuditoria).findBy({ recursoTipo: 'cliente', recursoId: a.id });
      expect(eventos).toHaveLength(1);
      expect(eventos[0]).toMatchObject({ actorUsuarioId: actor.sub, accion: 'cliente_creado', valoresAntes: null,
        valoresDespues: { version: 1, camposModificados: ['nombreCompleto', 'telefono'] }, ocurridoEn: f.reloj.ahora() });
      expect(JSON.stringify(eventos)).not.toMatch(/Persona independiente|6145550199|password|token|hash/);
    });
  });

  it('T041/T042 corrige por versión, conserva citas y no audita cambios normalizados equivalentes', async () => {
    await conBaseOperativa(async (db, segunda) => {
      const f = await crearClientesOperativos(db, segunda);
      const actor = f.identidad(Rol.RECEPCIONISTA);
      const cita = await db.getRepository(Cita).findOneByOrFail({ id: f.negocios[0].ocupaciones[0] });
      const antes = await db.getRepository(Cita).findBy({ negocioId: f.negocios[0].id });
      const corregida = await f.clientes.corregir(actor, String(cita.clienteId), { version: 1, nombreCompleto: 'Nombre corregido', telefono: '6140000000' });
      expect(corregida.version).toBe(2);
      expect(await db.getRepository(Cita).findBy({ negocioId: f.negocios[0].id })).toEqual(antes);
      const igual = await f.clientes.corregir(actor, String(cita.clienteId), { version: 2, nombreCompleto: ' Nombre corregido ', telefono: '+52 614-000-0000' });
      expect(igual.version).toBe(2);
      await expect(f.clientes.corregir(actor, String(cita.clienteId), { version: 1, nombreCompleto: 'Obsoleto' })).rejects.toMatchObject({ status: 409 });
      const eventos = await db.getRepository(EventoAuditoria).findBy({ recursoTipo: 'cliente', recursoId: cita.clienteId });
      expect(eventos).toHaveLength(1);
      expect(eventos[0]).toMatchObject({ accion: 'cliente_corregido', valoresAntes: { version: 1 }, valoresDespues: { version: 2 } });
    });
  });

  it.each(['crear', 'corregir'] as const)('T040/T042 revierte %s si falla la auditoría dentro del commit', async (operacion) => {
    await conBaseOperativa(async (db, segunda) => {
      const f = await crearClientesOperativos(db, segunda);
      const actor = f.identidad(Rol.ADMIN_NEGOCIO);
      const antes = await db.getRepository(Cliente).find();
      const eventosAntes = await db.getRepository(EventoAuditoria).count();
      const guardar = f.auditoria.registrar.bind(f.auditoria);
      const espia = jest.spyOn(f.auditoria, 'registrar').mockImplementationOnce(async (manager, datos) => {
        await guardar(manager, datos); // La fila de auditoría también debe revertirse.
        throw new Error('Fallo controlado después del evento');
      });
      try {
        const resultado = operacion === 'crear'
          ? f.clientes.crear(actor, { nombreCompleto: 'No persistir', telefono: '6141234567' })
          : f.clientes.corregir(actor, String(antes[0].id), { version: 1, nombreCompleto: 'No persistir' });
        await expect(resultado).rejects.toMatchObject({ status: 500 });
        expect(await db.getRepository(Cliente).find()).toEqual(antes);
        expect(await db.getRepository(EventoAuditoria).count()).toBe(eventosAntes);
      } finally { espia.mockRestore(); }
    });
  });

  it('T038–T042 deniega directorio y escrituras a Profesional/Superadmin e ignora claims de negocio', async () => {
    await conBaseOperativa(async (db, segunda) => {
      const f = await crearClientesOperativos(db, segunda);
      const ficha = await db.getRepository(Cliente).findOneByOrFail({ negocioId: f.negocios[0].id });
      for (const u of f.actores.filter((a) => a.rol === Rol.PROFESIONAL || a.rol === Rol.SUPERADMIN)) {
        const identidad = { sub: u.id, sesionId: u.sesionId };
        await expect(f.clientes.listar(identidad, {})).rejects.toMatchObject({ status: 403 });
        await expect(f.clientes.consultar(identidad, String(ficha.id), {})).rejects.toMatchObject({ status: 403 });
        await expect(f.clientes.historialCitas(identidad, String(ficha.id), {})).rejects.toMatchObject({ status: 403 });
        await expect(f.clientes.crear(identidad, { nombreCompleto: 'Denegado', telefono: '6141234567' })).rejects.toMatchObject({ status: 403 });
        await expect(f.clientes.corregir(identidad, String(ficha.id), { version: 1, nombreCompleto: 'Denegado' })).rejects.toMatchObject({ status: 403 });
      }
      const actor = { ...f.identidad(Rol.ADMIN_NEGOCIO), negocioId: f.negocios[1].id, rol: Rol.SUPERADMIN };
      const nueva = await f.clientes.crear(actor, { nombreCompleto: 'Negocio actual', telefono: '6141234567' });
      expect(nueva.negocioId).toBe(f.negocios[0].id);
      const ajeno = await db.getRepository(Cliente).findOneByOrFail({ negocioId: f.negocios[1].id });
      await expect(f.clientes.corregir(actor, String(ajeno.id), { version: 1, nombreCompleto: 'Ajeno' })).rejects.toMatchObject({ status: 404 });
    });
  });

  it('T041 dos conexiones con la misma versión confirman solo una corrección y un evento', async () => {
    await conBaseOperativa(async (db, segunda) => {
      const f = await crearClientesOperativos(db, segunda);
      const ficha = await db.getRepository(Cliente).findOneByOrFail({ negocioId: f.negocios[0].id });
      const resultados = await Promise.allSettled([
        f.clientes.corregir(f.identidad(Rol.ADMIN_NEGOCIO), String(ficha.id), { version: 1, nombreCompleto: 'Corrección A' }),
        f.clientesOtra.corregir(f.identidad(Rol.RECEPCIONISTA), String(ficha.id), { version: 1, nombreCompleto: 'Corrección B' }),
      ]);
      expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const rechazada = resultados.find((r) => r.status === 'rejected') as PromiseRejectedResult;
      expect(rechazada.reason).toMatchObject({ status: 409 });
      expect((await db.getRepository(Cliente).findOneByOrFail({ id: ficha.id })).version).toBe(2);
      expect(await db.getRepository(EventoAuditoria).countBy({ recursoTipo: 'cliente', recursoId: ficha.id })).toBe(1);
    });
  });

  it('T041 revalida sesión después de esperar la barrera común y no guarda una escritura ya revocada', async () => {
    await conBaseOperativa(async (db, segunda) => {
      const f = await crearClientesOperativos(db, segunda);
      const actor = f.identidad(Rol.ADMIN_NEGOCIO);
      const ficha = await db.getRepository(Cliente).findOneByOrFail({ negocioId: f.negocios[0].id });
      const espia = jest.spyOn(f.auditoria, 'registrar');
      const bloqueo = segunda.createQueryRunner();
      const observador = new DataSource({ ...db.options, entities: [], migrations: [], poolSize: 1 });
      let pendiente: Promise<unknown> | undefined;
      let avisarAutorizacion!: () => void;
      let continuar!: () => void;
      const autorizada = new Promise<void>((resolver) => { avisarAutorizacion = resolver; });
      const puerta = new Promise<void>((resolver) => { continuar = resolver; });
      const resolverAcceso = f.acceso.resolverEnTransaccion.bind(f.acceso);
      let primera = true;
      let conexionEscritor = 0;
      // La barrera abre después de una autorización real, sin sustituir su resultado ni la releída final.
      const resolucion = jest.spyOn(f.acceso, 'resolverEnTransaccion').mockImplementation(async (...args) => {
        const ctx = await resolverAcceso(...args);
        if (primera) {
          primera = false;
          conexionEscritor = Number((await ctx.manager.query('SELECT CONNECTION_ID() id'))[0].id);
          avisarAutorizacion();
          await puerta;
        }
        return ctx;
      });
      try {
        await observador.initialize();
        let terminado: unknown;
        pendiente = f.clientes.corregir(actor, String(ficha.id), { version: 1, nombreCompleto: 'No autorizado tras espera' })
          .then((valor) => ({ valor }), (error: unknown) => ({ error })).then((resultado) => { terminado = resultado; return resultado; });
        await Promise.race([autorizada, pendiente.then(() => { throw new Error('La operación terminó antes de abrir la barrera.'); })]);
        await bloqueo.connect();
        await bloqueo.startTransaction('READ COMMITTED');
        await bloqueo.query('SELECT id FROM negocios WHERE id=? FOR UPDATE', [f.negocios[0].id]);
        // Escritura de preparación sobre la barrera, sin cambiar cuenta, licencia ni ficha de cliente.
        await bloqueo.query("UPDATE negocios SET nombre=CONCAT(nombre,' bloqueado') WHERE id=?", [f.negocios[0].id]);
        continuar();
        // MariaDB retiene esta búsqueda constante en Statistics antes de publicarla en INNODB_LOCK_WAITS.
        // Observar el SELECT FOR UPDATE del escritor durante un segundo de servidor prueba la espera real.
        const limite = Date.now() + 5000;
        let esperando = false;
        while (Date.now() < limite) {
          const filas = await observador.query(`SELECT ID FROM information_schema.PROCESSLIST
            WHERE ID=? AND DB=DATABASE() AND COMMAND='Query' AND TIME>=1
              AND INFO LIKE '%FOR UPDATE' AND INFO LIKE '%negocios%'`, [conexionEscritor]);
          if (filas.length) { esperando = true; break; }
          await new Promise((resolver) => setTimeout(resolver, 20));
        }
        expect(terminado).toBeUndefined();
        expect(esperando).toBe(true);
        await bloqueo.manager.getRepository(Sesion).update(actor.sesionId, { revocadaEn: f.reloj.ahora() });
        await bloqueo.commitTransaction();
        expect(await pendiente).toMatchObject({ error: { status: 401 } });
        expect((await db.getRepository(Cliente).findOneByOrFail({ id: ficha.id })).version).toBe(1);
        expect((await db.getRepository(Cliente).findOneByOrFail({ id: ficha.id })).nombreCompleto).toBe(ficha.nombreCompleto);
        expect(espia).not.toHaveBeenCalled();
      } finally {
        continuar();
        if (bloqueo.isTransactionActive) await bloqueo.rollbackTransaction();
        if (pendiente) await pendiente;
        await bloqueo.release();
        if (observador.isInitialized) await observador.destroy();
        espia.mockRestore();
        resolucion.mockRestore();
      }
    });
  });

  it('registra el dominio en Nest y mantiene las rutas de clientes bajo autenticación', async () => {
    await conBaseOperativa(async (db, segunda) => {
      const f = await crearClientesOperativos(db, segunda);
      const modulo = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(DataSource).useValue(db).overrideProvider(RELOJ).useValue(f.reloj).compile();
      const app = modulo.createNestApplication();
      try {
        await app.init();
        const clientes = modulo.get(ClientesService);
        expect(clientes).toBeInstanceOf(ClientesService);
        await expect(clientes.crear(f.identidad(Rol.RECEPCIONISTA), { nombreCompleto: 'Composición Nest', telefono: '6141234567' })).resolves.toMatchObject({ version: 1 });
        // M4-T044 habilita la ruta privada: una petición anónima ahora exige sesión.
        await request(app.getHttpServer()).get('/clientes').expect(401);
      } finally { await app.close(); }
    });
  });
});
