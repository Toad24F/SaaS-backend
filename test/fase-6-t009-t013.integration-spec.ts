import type { DataSource } from 'typeorm';
import { Cliente } from '../src/disponibilidad/entities/cliente.entity';
import { UnionCliente } from '../src/clientes/entities/union-cliente.entity';
import { detectarDuplicadosClientes } from '../src/clientes/identidad-clientes.persistencia';
import { ResolucionClienteService } from '../src/clientes/resolucion-cliente.service';
import { conBaseMigrada, limitarMigracionesHasta, retrocederHastaMigracion } from './support/mariadb';
import { conBaseOperativa, crearEscenarioOperativo } from './support/operacion-fase-5';
import { crearDatosModulo5 } from './support/preparacion-modulo-5';
import { RelojPrueba } from './support/reloj';

const ahora = new Date('2026-11-21T18:00:00.000Z');
const contacto = { nombreCompleto: '  Ana\u00a0 María ', telefono: '+52 614-000-0001' };
const resolver = new ResolucionClienteService();

function insertarCliente(db: DataSource, negocioId: number, nombre: string, telefono: string) {
  return db.query('INSERT INTO clientes(negocio_id,nombre_completo,telefono) VALUES (?,?,?)',
    [negocioId, nombre, telefono]);
}

describe('M5-T009–T013: persistencia y resolución de fichas', () => {
  it('migra desde M4, detecta repetidos por negocio y conserva fichas y citas íntegras', async () => {
    await conBaseOperativa(async (db) => {
      await retrocederHastaMigracion(db, 'ReferenciasGestionOperativa1760000048000');
      limitarMigracionesHasta(db, 'RellenarIdentidadClientes1760000051000');
      const { negocios: [a, b] } = await crearEscenarioOperativo(db, new RelojPrueba(ahora));
      const [{ cliente_id: clienteId }] = await db.query('SELECT cliente_id FROM citas WHERE id=?', [a.ocupaciones[0]]);
      await db.query("UPDATE clientes SET nombre_completo='  PEÑA  ',version=4 WHERE id=?", [clienteId]);
      const duplicado = await insertarCliente(db, a.id, 'Pen\u0303a', a.telefonoCliente);
      await insertarCliente(db, a.id, 'Pena', a.telefonoCliente);
      await insertarCliente(db, b.id, 'Peña', a.telefonoCliente);
      const expandida = await insertarCliente(db, a.id, '𝅘𝅥𝅮'.repeat(150), a.telefonoCliente);
      const antes = await db.query('SELECT * FROM clientes ORDER BY id');
      const citas = await db.query('SELECT * FROM citas ORDER BY id');

      // Ejecutar migraciones reales desde el esquema histórico, con registros anteriores al cambio.
      expect((await db.runMigrations({ transaction: 'each' })).map((m) => m.timestamp))
        .toEqual([1760000049000, 1760000050000, 1760000051000]);
      const fichas = await db.query('SELECT * FROM clientes ORDER BY id');
      expect(fichas.map(({ nombre_normalizado: _nombre, fusionado_en_id: _fusion, ...fila }) => fila)).toEqual(antes);
      expect(fichas.every((fila: { fusionado_en_id: number | null }) => fila.fusionado_en_id === null)).toBe(true);
      expect(fichas.find((fila: { id: number }) => fila.id === clienteId).nombre_normalizado).toEqual(Buffer.from('peña'));
      expect(fichas.find((fila: { id: number }) => fila.id === Number(expandida.insertId)).nombre_normalizado)
        .toEqual(Buffer.from('𝅘𝅥𝅮'.repeat(150).normalize('NFC')));
      expect(await db.query('SELECT * FROM citas ORDER BY id')).toEqual(citas);
      expect(await detectarDuplicadosClientes(db.manager, a.id)).toEqual([[clienteId, Number(duplicado.insertId)]]);
      expect(await detectarDuplicadosClientes(db.manager, b.id)).toEqual([]);
      // El despliegue intermedio permite duplicados hasta la conciliación explícita.
      await db.query('UPDATE clientes SET nombre_normalizado=? WHERE id=?', [Buffer.from('peña'), expandida.insertId]);
      expect(await db.query('SELECT id FROM uniones_cliente')).toEqual([]);
    });
  });

  it('persiste origen, destino, actor, versiones y clave exacta con referencias del negocio', async () => {
    await conBaseMigrada(async (db) => {
      const { negocios: [a, b] } = await crearDatosModulo5(db, new RelojPrueba(ahora));
      const [origenId, destinoId] = a.clientes;
      const fichas = db.getRepository(Cliente);
      const uniones = db.getRepository(UnionCliente);
      const operacion = { negocioId: a.id, origenId, destinoId, actorUsuarioId: a.administradorId,
        versionOrigen: 1, versionDestino: 2, clave: 'Union-Prueba-00001', ocurridoEn: ahora };

      await expect(fichas.update(origenId, { fusionadoEnId: b.clientes[0] })).rejects.toThrow();
      await fichas.update(origenId, { fusionadoEnId: destinoId, nombreNormalizado: Buffer.from('origen') });
      const origen = await fichas.findOneOrFail({ where: { id: origenId }, relations: { fusionadoEn: true } });
      expect(origen).toMatchObject({ version: 1, fusionadoEnId: destinoId, fusionadoEn: { id: destinoId } });
      expect(origen.nombreNormalizado).toEqual(Buffer.from('origen'));

      // TypeORM agrega el ID generado al objeto de inserción; conservar el caso base sin ID.
      await uniones.insert({ ...operacion });
      expect(await uniones.findOneByOrFail({ clave: operacion.clave })).toMatchObject(operacion);
      await expect(uniones.insert({ ...operacion })).rejects.toThrow(/uq_uc_actor_clave/);
      await uniones.insert({ ...operacion, clave: operacion.clave.toLowerCase() });
      await uniones.insert({ ...operacion, actorUsuarioId: a.recepcionistaId });
      const ajena = { ...operacion, clave: 'Union-Prueba-00002' };
      for (const invalida of [{ origenId: b.clientes[0] }, { destinoId: b.clientes[0] },
        { actorUsuarioId: b.administradorId }, { destinoId: origenId }, { versionDestino: 0 }]) {
        await expect(uniones.insert({ ...ajena, ...invalida })).rejects.toThrow();
      }
      // Retirar la tabla con operaciones registradas descartaría el historial.
      await db.undoLastMigration({ transaction: 'each' });
      await expect(db.undoLastMigration({ transaction: 'each' })).rejects.toThrow('uniones');
      expect(await uniones.count()).toBe(3);
    }, 'citas_m5_test');
  });

  it('crea o reutiliza por identidad, incluso con datos heredados; ignora fichas absorbidas', async () => {
    await conBaseMigrada(async (db, segunda) => {
      const { negocios: [a, b] } = await crearDatosModulo5(db, new RelojPrueba(ahora));
      // Un valor heredado inválido puede comparar igual en la colación del teléfono,
      // pero no es el teléfono canónico devuelto por la validación mexicana.
      await insertarCliente(db, a.id, 'Ana María', '６１４００００００１');
      const [creada, rival] = await Promise.all([db, segunda].map((conexion) =>
        conexion.transaction('READ COMMITTED', (manager) => resolver.resolverEnTransaccion(manager, a.id, contacto, ahora))));
      expect(creada.ficha.id).toBe(rival.ficha.id);
      expect([creada.creada, rival.creada].sort()).toEqual([false, true]);
      const id = creada.ficha.id;
      expect(await db.query('SELECT id FROM clientes WHERE negocio_id=? AND BINARY telefono=?', [a.id, '6140000001']))
        .toEqual([{ id }]);
      expect(creada.ficha.nombreNormalizado).toEqual(Buffer.from('ana maría'));
      expect(creada.ficha.telefono).toBe('6140000001');
      const resolverEn = (negocioId: number, entrada = contacto) => db.transaction('READ COMMITTED',
        (manager) => resolver.resolverEnTransaccion(manager, negocioId, entrada, ahora));
      const repetida = await resolverEn(a.id, { ...contacto, nombreCompleto: 'ANA MARI\u0301A' });
      expect(repetida).toMatchObject({ creada: false, ficha: { id, nombreCompleto: 'Ana\u00a0 María', version: 1 } });
      expect((await resolverEn(b.id)).ficha.id).not.toBe(id);
      expect((await resolverEn(a.id, { ...contacto, nombreCompleto: 'Ana Maria' })).ficha.id).not.toBe(id);

      const duplicado = await insertarCliente(db, a.id, 'ANA  MARÍA', '6140000001');
      await expect(resolverEn(a.id)).rejects.toMatchObject({ status: 409 });
      await db.getRepository(Cliente).update(Number(duplicado.insertId), { fusionadoEnId: id });
      expect((await resolverEn(a.id)).ficha.id).toBe(id);

      // Un editor previo puede dejar una clave derivada desactualizada durante la transición.
      await db.getRepository(Cliente).update(id, { nombreCompleto: '  Emilia  ' });
      expect((await resolverEn(a.id, { ...contacto, nombreCompleto: 'EMILIA' })).ficha.id).toBe(id);
      expect((await resolverEn(a.id)).creada).toBe(true);
    }, 'citas_m5_test');
  });

  it('exige una transacción del llamador y su alta revierte con ella', async () => {
    await conBaseMigrada(async (db) => {
      const { negocios: [a] } = await crearDatosModulo5(db, new RelojPrueba(ahora));
      await expect(resolver.resolverEnTransaccion(db.manager, a.id, contacto, ahora)).rejects.toThrow('transacción');
      await expect(db.transaction('READ COMMITTED', async (manager) => {
        expect((await resolver.resolverEnTransaccion(manager, a.id, contacto, ahora)).creada).toBe(true);
        throw new Error('Reversión de prueba');
      })).rejects.toThrow('Reversión de prueba');
      expect(await db.query('SELECT id FROM clientes WHERE negocio_id=? AND telefono=?', [a.id, '6140000001']))
        .toEqual([]);
    }, 'citas_m5_test');
  });
});
