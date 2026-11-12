import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { conBaseOperativa, crearEscenarioOperativo } from './support/operacion-fase-5';
import { RelojPrueba } from './support/reloj';
import { retrocederHastaMigracion } from './support/mariadb';

const MIGRACIONES = [
  'VersionCitas1760000043000', 'VersionClientes1760000044000',
  'IntentosCitaManual1760000045000', 'EventosCita1760000046000',
  'AuditoriaClientes1760000047000', 'ReferenciasGestionOperativa1760000048000',
];
const AHORA = new Date('2026-11-08T12:00:00.000Z');
const HASH = 'a'.repeat(64);

// Todos los casos escriben solo en el esquema efímero generado por conBaseOperativa.
async function escenario(db: DataSource) {
  const { negocios: [a, b] } = await crearEscenarioOperativo(db, new RelojPrueba(AHORA));
  const sesiones: number[] = [];
  for (const n of [a, b]) {
    sesiones.push(Number((await db.query(`INSERT INTO sesiones_reserva_publica
      (negocio_id,titular_hash) VALUES(?,?)`, [n.id, HASH])).insertId));
  }
  return { a, b, sesiones };
}

function insertarIntento(db: DataSource, negocio: number, actor: number, clave = 'clave-opaca-manual-0001') {
  return db.query(`INSERT INTO intentos_cita_manual
    (negocio_id,actor_usuario_id,clave,contenido_hash) VALUES(?,?,?,?)`, [negocio, actor, clave, HASH]);
}

function insertarEvento(db: DataSource, negocio: number, cita: number, actor: number | null,
  sesion: number | null = null, version = 1) {
  return db.query(`INSERT INTO eventos_cita
    (negocio_id,cita_id,actor_usuario_id,sesion_publica_id,accion,version_resultante,
     valores_antes,valores_despues,motivo,ocurrido_en)
    VALUES(?,?,?,?,'alta',?,NULL,?,NULL,?)`,
  [negocio, cita, actor, sesion, version, JSON.stringify({ estado: 'confirmada' }), AHORA]);
}

describe('M4-T007–T012: persistencia aditiva operativa', () => {
  it('T007–T008 actualiza el esquema previo sin cambiar ningún dato y admite down/up sin uso', async () => {
    await conBaseOperativa(async (db) => {
      // Reconstruye el límite exacto de fase 4; no depende de un número fijo de migraciones.
      while (true) {
        const [ultima] = await db.query('SELECT name FROM migrations ORDER BY timestamp DESC LIMIT 1');
        if (ultima.name === 'SucesionIntentos1760000042000') break;
        await db.undoLastMigration({ transaction: 'each' });
      }
      await crearEscenarioOperativo(db, new RelojPrueba(AHORA));
      const antes = {
        citas: await db.query('SELECT * FROM citas ORDER BY id'),
        clientes: await db.query('SELECT * FROM clientes ORDER BY id'),
        apartados: await db.query('SELECT * FROM bloqueos_temporales ORDER BY id'),
      };
      expect((await db.runMigrations({ transaction: 'each' })).map((m) => m.name)).toEqual(MIGRACIONES);
      for (const tabla of ['citas', 'clientes'] as const) {
        const despues = await db.query(`SELECT * FROM ${tabla} ORDER BY id`);
        expect(despues.every((fila: { version: number }) => fila.version === 1)).toBe(true);
        expect(despues.map(({ version: _version, ...fila }: Record<string, unknown>) => fila)).toEqual(antes[tabla]);
      }
      expect(await db.query('SELECT * FROM bloqueos_temporales ORDER BY id')).toEqual(antes.apartados);
      expect(await db.query('SELECT id FROM eventos_cita')).toEqual([]);
      for (const nombre of [...MIGRACIONES].reverse()) {
        const [ultima] = await db.query('SELECT name FROM migrations ORDER BY timestamp DESC LIMIT 1');
        expect(ultima.name).toBe(nombre);
        await db.undoLastMigration({ transaction: 'each' });
      }
      expect(await db.query('SELECT * FROM citas ORDER BY id')).toEqual(antes.citas);
      expect((await db.runMigrations({ transaction: 'each' })).map((m) => m.name)).toEqual(MIGRACIONES);
      expect(await db.runMigrations({ transaction: 'each' })).toEqual([]);
    });
  });

  it('T007–T008 conserva teléfono no único y exige versiones positivas en filas nuevas y existentes', async () => {
    await conBaseOperativa(async (db) => {
      const { a } = await escenario(db);
      const alta = await db.query(`INSERT INTO clientes(negocio_id,nombre_completo,telefono)
        VALUES(?,'Tercera persona',?)`, [a.id, a.telefonoCliente]);
      expect((await db.query('SELECT version FROM clientes WHERE id=?', [alta.insertId]))[0].version).toBe(1);
      const [cliente] = await db.query('SELECT id FROM clientes WHERE negocio_id=? LIMIT 1', [a.id]);
      for (const [tabla, id] of [['citas', a.ocupaciones[0]], ['clientes', cliente.id]] as const) {
        for (const valor of [0, -1, null]) {
          await expect(db.query(`UPDATE ${tabla} SET version=? WHERE id=?`, [valor, id])).rejects.toThrow();
        }
        expect((await db.query(`SELECT version FROM ${tabla} WHERE id=?`, [id]))[0].version).toBe(1);
      }
      const [indice] = await db.query("SHOW INDEX FROM clientes WHERE Key_name='idx_cliente_por_negocio_telefono'");
      expect(Number(indice.Non_unique)).toBe(1);
    });
  });

  it('T009 deduplica por negocio/actor/clave con comparación exacta y solo persiste huella', async () => {
    await conBaseOperativa(async (db) => {
      const { a, b } = await escenario(db);
      const clave = 'Clave-opaca-manual-0001';
      await insertarIntento(db, a.id, a.profesionales[0], clave);
      await expect(insertarIntento(db, a.id, a.profesionales[0], clave)).rejects.toThrow();
      // Administración tiene cuenta, pero no necesita una fila de perfil Profesional.
      const [administrador] = await db.query("SELECT id FROM usuarios WHERE negocio_id=? AND rol='admin_negocio'", [a.id]);
      expect(await db.query('SELECT id FROM personal WHERE id=?', [administrador.id])).toEqual([]);
      await insertarIntento(db, a.id, administrador.id, clave);
      await insertarIntento(db, b.id, b.profesionales[0], clave);
      await insertarIntento(db, a.id, a.profesionales[0], clave.toLowerCase());
      const columnas = (await db.query('SHOW COLUMNS FROM intentos_cita_manual')).map((c: { Field: string }) => c.Field);
      expect(columnas).toEqual(expect.arrayContaining(['contenido_hash', 'estado', 'cita_id', 'creado_en', 'actualizado_en', 'resuelto_en']));
      for (const prohibida of ['nombre', 'telefono', 'contacto', 'notas', 'contenido', 'token']) expect(columnas).not.toContain(prohibida);
      for (const [campo, valor] of [['clave', 'corta'], ['clave', ' clave-manual-0001'],
        ['contenido_hash', 'z'.repeat(64)], ['contenido_hash', 'a'.repeat(63)], ['estado', 'desconocido']] as const) {
        await expect(db.query(`UPDATE intentos_cita_manual SET ${campo}=? WHERE negocio_id=?`, [valor, a.id])).rejects.toThrow();
      }
      expect((await db.query('SELECT id FROM intentos_cita_manual')).length).toBe(4);
    });
  });

  it('T009 mantiene los tres estados y exige resultado solo para registrado, sin duplicar cita', async () => {
    await conBaseOperativa(async (db) => {
      const { a } = await escenario(db);
      const primero = await insertarIntento(db, a.id, a.profesionales[0]);
      const segundo = await insertarIntento(db, a.id, a.profesionales[1]);
      expect((await db.query('SELECT estado,cita_id,resuelto_en FROM intentos_cita_manual WHERE id=?', [primero.insertId]))[0])
        .toEqual({ estado: 'preparado', cita_id: null, resuelto_en: null });
      await expect(db.query("UPDATE intentos_cita_manual SET estado='registrado',resuelto_en=? WHERE id=?", [AHORA, primero.insertId])).rejects.toThrow();
      await db.query("UPDATE intentos_cita_manual SET estado='registrado',cita_id=?,resuelto_en=? WHERE id=?",
        [a.ocupaciones[0], AHORA, primero.insertId]);
      await expect(db.query("UPDATE intentos_cita_manual SET estado='registrado',cita_id=?,resuelto_en=? WHERE id=?",
        [a.ocupaciones[0], AHORA, segundo.insertId])).rejects.toThrow();
      await db.query("UPDATE intentos_cita_manual SET estado='no_registrado',resuelto_en=? WHERE id=?", [AHORA, segundo.insertId]);
      await expect(db.query('UPDATE intentos_cita_manual SET cita_id=? WHERE id=?', [a.ocupaciones[0], segundo.insertId])).rejects.toThrow();
      expect((await db.query('SELECT estado FROM intentos_cita_manual ORDER BY id')).map((f: { estado: string }) => f.estado))
        .toEqual(['registrado', 'no_registrado']);
    });
  });

  it('T010 agrega eventos de personal y públicos, conserva anterior/nuevo y bloquea sobrescritura/borrado', async () => {
    await conBaseOperativa(async (db) => {
      const { a, b, sesiones } = await escenario(db);
      const alta = await insertarEvento(db, a.id, a.ocupaciones[0], a.profesionales[0]);
      await insertarEvento(db, b.id, b.ocupaciones[0], null, sesiones[1]);
      await db.query(`INSERT INTO eventos_cita
        (negocio_id,cita_id,actor_usuario_id,accion,version_resultante,valores_antes,valores_despues,motivo)
        VALUES(?,?,?,'cancelacion',2,?,?,?)`,
      [a.id, a.ocupaciones[0], a.profesionales[0], '{"estado":"confirmada"}', '{"estado":"cancelada"}', 'Solicitado por paciente']);
      const antes = await db.query('SELECT * FROM eventos_cita ORDER BY id');
      expect(antes).toHaveLength(3);
      expect(antes[0].ocurrido_en).toEqual(AHORA);
      // MariaDB/mysql2 puede entregar JSON ya decodificado; ambas representaciones son válidas.
      const json = (valor: unknown) => typeof valor === 'string' ? JSON.parse(valor) : valor;
      expect(json(antes[2].valores_antes)).toEqual({ estado: 'confirmada' });
      expect(json(antes[2].valores_despues)).toEqual({ estado: 'cancelada' });
      expect(antes[2].motivo).toBe('Solicitado por paciente');
      await expect(db.query("UPDATE eventos_cita SET motivo='Sobrescrito' WHERE id=?", [alta.insertId])).rejects.toThrow('inmutable');
      await expect(db.query('DELETE FROM eventos_cita WHERE id=?', [alta.insertId])).rejects.toThrow('inmutable');
      await expect(insertarEvento(db, a.id, a.ocupaciones[0], a.profesionales[1])).rejects.toThrow();
      expect(await db.query('SELECT * FROM eventos_cita ORDER BY id')).toEqual(antes);
    });
  });

  it('T010 rechaza actor ausente/doble, versión cero, JSON inválido y uso público fuera del alta', async () => {
    await conBaseOperativa(async (db) => {
      const { a, sesiones } = await escenario(db);
      await expect(insertarEvento(db, a.id, a.ocupaciones[0], null)).rejects.toThrow();
      await expect(insertarEvento(db, a.id, a.ocupaciones[0], a.profesionales[0], sesiones[0])).rejects.toThrow();
      await expect(insertarEvento(db, a.id, a.ocupaciones[0], a.profesionales[0], null, 0)).rejects.toThrow();
      await expect(db.query(`INSERT INTO eventos_cita
        (negocio_id,cita_id,sesion_publica_id,accion,version_resultante,valores_despues)
        VALUES(?,?,?,'cambio_estado',1,'{}')`, [a.id, a.ocupaciones[0], sesiones[0]])).rejects.toThrow();
      await expect(db.query(`INSERT INTO eventos_cita
        (negocio_id,cita_id,actor_usuario_id,accion,version_resultante,valores_despues)
        VALUES(?,?,?,'alta',1,'JSON incorrecto')`, [a.id, a.ocupaciones[0], a.profesionales[0]])).rejects.toThrow();
      expect(await db.query('SELECT id FROM eventos_cita')).toEqual([]);
    });
  });

  it('T011 agrega cliente a auditoría sin aceptar recursos desconocidos o referencias incompletas', async () => {
    await conBaseOperativa(async (db) => {
      const { a } = await escenario(db);
      for (const tipo of ['sucursal', 'servicio', 'profesional', 'horario', 'bloqueo', 'cliente']) {
        await db.query(`INSERT INTO eventos_auditoria
          (operacion_id,actor_usuario_id,negocio_id,recurso_tipo,recurso_id,accion)
          VALUES(?,?,?,?,1,'prueba_migracion')`, [randomUUID(), a.profesionales[0], a.id, tipo]);
      }
      for (const [tipo, id] of [['desconocido', 1], ['cliente', null], [null, 1], ['cliente', 0]] as const) {
        await expect(db.query(`INSERT INTO eventos_auditoria
          (operacion_id,actor_usuario_id,negocio_id,recurso_tipo,recurso_id,accion)
          VALUES(?,?,?,?,?,'prueba_invalida')`, [randomUUID(), a.profesionales[0], a.id, tipo, id])).rejects.toThrow();
      }
      expect(await db.query('SELECT recurso_tipo FROM eventos_auditoria')).toHaveLength(6);
    });
  });

  it('T012 impide enlazar actores, citas y sesiones ajenos, también al actualizar intentos', async () => {
    await conBaseOperativa(async (db) => {
      const { a, b, sesiones } = await escenario(db);
      await expect(insertarIntento(db, a.id, b.profesionales[0])).rejects.toThrow();
      const intento = await insertarIntento(db, a.id, a.profesionales[0]);
      await expect(db.query('UPDATE intentos_cita_manual SET actor_usuario_id=? WHERE id=?', [b.profesionales[0], intento.insertId])).rejects.toThrow();
      await expect(db.query("UPDATE intentos_cita_manual SET estado='registrado',cita_id=?,resuelto_en=? WHERE id=?",
        [b.ocupaciones[0], AHORA, intento.insertId])).rejects.toThrow();
      await expect(insertarEvento(db, a.id, b.ocupaciones[0], a.profesionales[0])).rejects.toThrow();
      await expect(insertarEvento(db, a.id, a.ocupaciones[0], b.profesionales[0])).rejects.toThrow();
      await expect(insertarEvento(db, a.id, a.ocupaciones[0], null, sesiones[1])).rejects.toThrow();
      expect(await db.query('SELECT id FROM eventos_cita')).toEqual([]);
      expect((await db.query('SELECT estado,cita_id FROM intentos_cita_manual WHERE id=?', [intento.insertId]))[0])
        .toEqual({ estado: 'preparado', cita_id: null });
    });
  });

  it('T012 expone índices por negocio/actor e historial y FKs compuestas con borrado restringido', async () => {
    await conBaseOperativa(async (db) => {
      for (const [tabla, indice, columnas] of [
        ['intentos_cita_manual', 'uq_icm_actor_clave', 'negocio_id,actor_usuario_id,clave'],
        ['intentos_cita_manual', 'idx_icm_actor_estado_fecha', 'negocio_id,actor_usuario_id,estado,creado_en,id'],
        ['eventos_cita', 'uq_ec_cita_version', 'negocio_id,cita_id,version_resultante'],
        ['eventos_cita', 'idx_ec_cita_fecha', 'negocio_id,cita_id,ocurrido_en,id'],
      ] as const) {
        const filas = await db.query('SELECT COLUMN_NAME columna FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND INDEX_NAME=? ORDER BY SEQ_IN_INDEX', [tabla, indice]);
        expect(filas.map((f: { columna: string }) => f.columna).join(',')).toBe(columnas);
      }
      const fks = await db.query(`SELECT k.CONSTRAINT_NAME nombre,
        GROUP_CONCAT(k.COLUMN_NAME ORDER BY k.ORDINAL_POSITION) columnas,
        GROUP_CONCAT(k.REFERENCED_COLUMN_NAME ORDER BY k.ORDINAL_POSITION) destino,
        r.DELETE_RULE borrado FROM information_schema.KEY_COLUMN_USAGE k
        JOIN information_schema.REFERENTIAL_CONSTRAINTS r
          ON r.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME=k.CONSTRAINT_NAME
        WHERE k.TABLE_SCHEMA=DATABASE() AND k.TABLE_NAME IN ('intentos_cita_manual','eventos_cita')
        AND k.REFERENCED_TABLE_NAME IS NOT NULL GROUP BY k.CONSTRAINT_NAME,r.DELETE_RULE`);
      for (const nombre of ['fk_icm_actor', 'fk_icm_cita', 'fk_ec_actor', 'fk_ec_cita', 'fk_ec_sesion']) {
        const fk = fks.find((f: { nombre: string }) => f.nombre === nombre);
        expect(fk).toMatchObject({ destino: 'negocio_id,id', borrado: 'RESTRICT' });
        expect(fk.columnas.split(',')[0]).toBe('negocio_id');
      }
    });
  });

  it('rechaza down destructivo si ya hay versiones, intentos, eventos o auditoría de cliente en uso', async () => {
    await conBaseOperativa(async (db) => {
      const { a } = await escenario(db);
      await insertarIntento(db, a.id, a.profesionales[0]);
      await insertarEvento(db, a.id, a.ocupaciones[0], a.profesionales[0]);
      await db.query('UPDATE citas SET version=2 WHERE id=?', [a.ocupaciones[0]]);
      await db.query('UPDATE clientes SET version=2 WHERE negocio_id=?', [a.id]);
      await db.query(`INSERT INTO eventos_auditoria
        (operacion_id,actor_usuario_id,negocio_id,recurso_tipo,recurso_id,accion)
        VALUES(?,?,?,'cliente',1,'cliente_creado')`, [randomUUID(), a.profesionales[0], a.id]);
      const runner = db.createQueryRunner();
      await runner.connect();
      try {
        // Cada down debe rechazar antes de tocar DDL: MariaDB no revierte ALTER TABLE.
        for (const nombre of MIGRACIONES) {
          const migracion = db.migrations.find((m) => m.name === nombre);
          expect(migracion).toBeDefined();
          await expect(migracion!.down(runner)).rejects.toThrow('sin perder');
        }
        expect(await db.query('SELECT id FROM eventos_cita')).toHaveLength(1);
        expect(await db.query('SELECT id FROM intentos_cita_manual')).toHaveLength(1);
      } finally { await runner.release(); }
    });
  });

  it('protege las regresiones históricas de destinos ajenos y límites inexistentes antes de revertir', async () => {
    const query = jest.fn().mockResolvedValue([{ name: 'unica_migracion' }]);
    const undoLastMigration = jest.fn();
    const db = { options: { database: 'base_cotidiana' }, query, undoLastMigration };
    await expect(retrocederHastaMigracion(db as unknown as DataSource, 'inexistente')).rejects.toThrow('no es seguro');
    expect(query).not.toHaveBeenCalled();
    db.options.database = `citas_m4_test_${'a'.repeat(32)}`;
    await expect(retrocederHastaMigracion(db as unknown as DataSource, 'inexistente')).rejects.toThrow('límite histórico');
    expect(undoLastMigration).not.toHaveBeenCalled();
  });
});
