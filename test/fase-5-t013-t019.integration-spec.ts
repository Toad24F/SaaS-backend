import { Test, type TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { RELOJ } from '../src/comun/reloj';
import { Cita } from '../src/disponibilidad/entities/cita.entity';
import { Cliente } from '../src/disponibilidad/entities/cliente.entity';
import { ApartadosService } from '../src/reservas-publicas/apartados.service';
import { IntentosReservaPublicaService } from '../src/reservas-publicas/intentos-reserva-publica.service';
import { RegistroReservaPublicaService } from '../src/reservas-publicas/registro-reserva-publica.service';
import { conBaseOperativa, crearEscenarioOperativo } from './support/operacion-fase-5';
import { retrocederHastaMigracion } from './support/mariadb';
import { crearEscenarioPortal } from './support/escenario-portal';
import { RelojPrueba } from './support/reloj';

const AHORA = new Date('2026-10-20T12:00:00.000Z');
const CONTACTO = { nombre: 'Persona pública', telefono: '6147778899', notas: 'Nota privada' };
const json = (valor: unknown) => typeof valor === 'string' ? JSON.parse(valor) : valor;

// El escritor y el motor son los de producción; solo se inyectan base efímera y reloj.
async function conRegistro(ejecutar: (f: {
  db: DataSource; segunda: DataSource; negocioId: number; titular: string; sesionId: number;
  apartadoId: number; intentoId: string; clave: string; reloj: RelojPrueba;
  registro: RegistroReservaPublicaService; otroRegistro: RegistroReservaPublicaService;
}) => Promise<void>) {
  await conBaseOperativa(async (db, segunda) => {
    const reloj = new RelojPrueba(AHORA);
    const { negocios: [a] } = await crearEscenarioPortal(db, reloj);
    await db.query(`INSERT INTO licencias(negocio_id,creado_en,habilitada_en,vence_en)
      VALUES(?,'2026-01-01','2026-01-01','2027-01-01')`, [a.id]);
    await db.query(`INSERT INTO horarios_personal(negocio_id,personal_id,sucursal_id,
      dia_semana,orden,inicio_minutos,fin_minutos,activo) VALUES(?,?,?,2,0,480,720,1)`,
    [a.id, a.profesionales[0], a.sucursales[0].id]);
    const [servicio] = await db.query('SELECT id FROM servicios WHERE negocio_id=? AND activo=1', [a.id]);
    const anterior = process.env.PORTAL_FORMULARIO_HMAC_SECRET;
    process.env.PORTAL_FORMULARIO_HMAC_SECRET = 'secreto-hmac-prueba-m4-013-019-123456789';
    const modulos: TestingModule[] = [];
    try {
      for (const fuente of [db, segunda]) {
        modulos.push(await Test.createTestingModule({ imports: [AppModule] })
          .overrideProvider(DataSource).useValue(fuente).overrideProvider(RELOJ).useValue(reloj).compile());
      }
      const titular = 'b'.repeat(64);
      const sesion = await db.query('INSERT INTO sesiones_reserva_publica(negocio_id,titular_hash) VALUES(?,?)', [a.id, titular]);
      const apartado = await modulos[0].get(ApartadosService).solicitar(a.id, titular, {
        clave: 'operacion_m4_013_019_0001', personalId: a.profesionales[0],
        sucursalId: a.sucursales[0].id, servicioId: servicio.id,
        fechaLocal: '2026-10-20', horaInicio: '08:00' });
      expect(apartado.estado).toBe('concedida');
      const clave = 'intento_m4_013_019_0001';
      const intento = await modulos[0].get(IntentosReservaPublicaService).preparar(a.id, titular,
        { clave, apartadoId: apartado.apartadoId! });
      await ejecutar({ db, segunda, negocioId: a.id, titular, sesionId: Number(sesion.insertId),
        apartadoId: apartado.apartadoId!, intentoId: intento.id, clave, reloj,
        registro: modulos[0].get(RegistroReservaPublicaService),
        otroRegistro: modulos[1].get(RegistroReservaPublicaService) });
    } finally {
      try { for (const modulo of modulos.reverse()) await modulo.close(); }
      finally {
        if (anterior === undefined) delete process.env.PORTAL_FORMULARIO_HMAC_SECRET;
        else process.env.PORTAL_FORMULARIO_HMAC_SECRET = anterior;
      }
    }
  });
}

async function fotografiar(db: DataSource, tablas: string[]) {
  const datos: Record<string, Record<string, unknown>[]> = {};
  for (const tabla of tablas) datos[tabla] = await db.query(`SELECT * FROM ${tabla} ORDER BY id`);
  return datos;
}

describe('M4-T013–T019: modelo completo y alta pública auditada', () => {
  it.each([Cita, Cliente])('T013 representa versión inicial positiva y explícita en %p', async (entidad) => {
    await conBaseOperativa(async (db) => {
      const columna = db.getMetadata(entidad).findColumnWithPropertyName('version');
      expect(columna).toBeDefined();
      expect(columna).toMatchObject({ databaseName: 'version', type: 'int',
        unsigned: true, isNullable: false, default: 1, isVersion: false });
    });
  });

  it.each(['intentos_cita_manual', 'eventos_cita'])('T014/T015 alinea columnas, índices y FKs ORM con %s', async (tabla) => {
    await conBaseOperativa(async (db) => {
      const meta = db.entityMetadatas.find((m) => m.tableName === tabla);
      expect(meta).toBeDefined();
      const columnas = await db.query(`SHOW FULL COLUMNS FROM ${tabla}`);
      expect(meta!.columns.map((c) => c.databaseName).sort()).toEqual(columnas.map((c: { Field: string }) => c.Field).sort());
      for (const columna of meta!.columns) {
        const sql = columnas.find((c: { Field: string }) => c.Field === columna.databaseName);
        expect(sql.Null).toBe(columna.isNullable ? 'YES' : 'NO');
        const tipo = String(sql.Type).split(/[ (]/)[0];
        // MariaDB representa JSON mediante LONGTEXT con CHECK; MySQL puede usar JSON nativo.
        expect(columna.type === 'json' ? ['longtext', 'json'] : [columna.type]).toContain(tipo);
        if (columna.type === 'int' || columna.type === 'bigint') {
          expect(String(sql.Type).includes('unsigned')).toBe(columna.unsigned);
        }
        if (columna.type === 'char' || columna.type === 'varchar') {
          expect(sql.Type).toBe(`${columna.type}(${columna.length})`);
        }
        if (columna.type === 'datetime') expect(sql.Type).toBe(`datetime(${columna.precision})`);
        if (columna.type === 'enum') expect(sql.Type).toBe(`enum('${columna.enum!.join("','")}')`);
        if (columna.collation) expect(sql.Collation).toBe(columna.collation);
        if (columna.charset) expect(String(sql.Collation).startsWith(`${columna.charset}_`)).toBe(true);
        if (columna.default !== undefined) {
          const valor = typeof columna.default === 'function' ? columna.default() : columna.default;
          expect(String(sql.Default).replace(/^'|'$/g, '').toLowerCase()).toBe(String(valor).toLowerCase());
        }
        if (columna.isGenerated) expect(sql.Extra).toContain('auto_increment');
        if (columna.isUpdateDate) expect(String(sql.Extra).toLowerCase()).toContain('on update current_timestamp(6)');
      }
      const checks = await db.query("SELECT CONSTRAINT_NAME nombre FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND CONSTRAINT_TYPE='CHECK'", [tabla]);
      expect(checks.map((c: { nombre: string }) => c.nombre)).toEqual(expect.arrayContaining(meta!.checks.map((c) => c.name)));
      for (const indice of meta!.indices) {
        const filas = await db.query('SELECT COLUMN_NAME columna,NON_UNIQUE noUnico FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND INDEX_NAME=? ORDER BY SEQ_IN_INDEX', [tabla, indice.name]);
        expect(filas.map((f: { columna: string }) => f.columna)).toEqual(indice.columns.map((c) => c.databaseName));
        expect(Number(filas[0].noUnico)).toBe(indice.isUnique ? 0 : 1);
      }
      for (const fk of meta!.foreignKeys) {
        const filas = await db.query('SELECT COLUMN_NAME columna,REFERENCED_COLUMN_NAME destino,REFERENCED_TABLE_NAME tablaDestino FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND CONSTRAINT_NAME=? ORDER BY ORDINAL_POSITION', [tabla, fk.name]);
        // TypeORM 1.1 ordena por PK referenciada; el DDL conserva negocio primero.
        // Comparamos cada par local/destino (sin perder su asociación); los índices sí mantienen orden estricto.
        expect(filas.map((f: { columna: string; destino: string }) => `${f.columna}->${f.destino}`).sort())
          .toEqual(fk.columns.map((c, i) => `${c.databaseName}->${fk.referencedColumns[i].databaseName}`).sort());
        expect(filas.every((f: { tablaDestino: string }) => f.tablaDestino === fk.referencedEntityMetadata.tableName)).toBe(true);
        expect(fk.onDelete).toBe('RESTRICT');
      }
      expect(meta!.foreignKeys).toHaveLength(tabla === 'eventos_cita' ? 4 : 3);
      expect(meta!.indices).toHaveLength(tabla === 'eventos_cita' ? 5 : 4);
    });
  });

  it('T016 instala el modelo completo, consulta sus versiones y guarda las entidades nuevas', async () => {
    await conBaseOperativa(async (db, segunda) => {
      expect(Number((await db.query('SELECT COUNT(*) total FROM migrations'))[0].total)).toBe(db.migrations.length);
      expect(await segunda.runMigrations({ transaction: 'each' })).toEqual([]);
      const { negocios: [a] } = await crearEscenarioOperativo(db, new RelojPrueba(AHORA));
      expect((await db.getRepository(Cita).findOneByOrFail({ id: a.ocupaciones[0] }))).toHaveProperty('version', 1);
      const cliente = await db.getRepository(Cliente).findOneByOrFail({ negocioId: a.id });
      expect(cliente).toHaveProperty('version', 1);
      const intento = await db.getRepository('intentos_cita_manual').save({ negocioId: a.id,
        actorUsuarioId: a.profesionales[0], clave: 'clave_orm_m4_013_019', contenidoHash: 'a'.repeat(64) });
      expect(await db.getRepository('intentos_cita_manual').findOneByOrFail({ id: intento.id }))
        .toMatchObject({ estado: 'preparado', citaId: null, resueltoEn: null });
      await db.getRepository('eventos_cita').insert({ negocioId: a.id, citaId: a.ocupaciones[0],
        actorUsuarioId: a.profesionales[0], sesionPublicaId: null, accion: 'alta',
        versionResultante: 1, valoresAntes: null, valoresDespues: { estado: 'pendiente' }, motivo: null });
      expect(await db.getRepository('eventos_cita').count()).toBe(1);
    });
  });

  it('T017 conserva una base de fase 4 con intento registrado, folio, snapshots y teléfono compartido', async () => {
    await conBaseOperativa(async (db) => {
      await retrocederHastaMigracion(db, 'SucesionIntentos1760000042000');
      // Semilla histórica por SQL: las entidades actuales no se usan sobre columnas aún ausentes.
      const { negocios: [a] } = await crearEscenarioPortal(db, new RelojPrueba(AHORA));
      const sesion = await db.query('INSERT INTO sesiones_reserva_publica(negocio_id,titular_hash,generacion) VALUES(?,?,1)', [a.id, 'c'.repeat(64)]);
      const [apartado] = await db.query('SELECT * FROM bloqueos_temporales WHERE id=?', [a.ocupaciones[1]]);
      const operacion = await db.query(`INSERT INTO operaciones_apartado
        (negocio_id,sesion_id,clave,generacion,seleccion_hash,personal_id,sucursal_id,servicio_id,fecha_local,hora_inicio,estado,apartado_id)
        VALUES(?,?,?,1,?,?,?,?,?,'08:00','concedida',?)`,
      [a.id, sesion.insertId, 'operacion_historica_001', 'd'.repeat(64), apartado.personal_id,
        apartado.sucursal_id, apartado.servicio_id, '2026-10-20', apartado.id]);
      await db.query(`UPDATE bloqueos_temporales SET sesion_id=?,generacion=1,operacion_id=?,
        costo_aceptado=99.50,zona_horaria_apartado='America/Mexico_City',separacion_minutos=5,
        fin_ocupacion_utc=DATE_ADD(fin_utc,INTERVAL 5 MINUTE),modo_concesion='ventana_libre',version_reglas=1,
        liberado_en=? WHERE id=?`, [sesion.insertId, operacion.insertId, AHORA, apartado.id]);
      await db.query(`UPDATE citas SET origen='portal_publico',apartado_origen_id=?,personal_id=?,
        sucursal_id=?,inicio_utc=?,fin_utc=?,separacion_minutos=5,fin_ocupacion_utc=?,
        costo_aceptado=99.50,nombre_contacto='Contacto histórico',telefono_contacto='6141234567',
        nombre_negocio='Negocio anterior',nombre_servicio='Servicio anterior',nombre_sucursal='Sede anterior',
        nombre_profesional='Profesional anterior',zona_horaria_reserva='America/Mexico_City' WHERE id=?`,
      [apartado.id, apartado.personal_id, apartado.sucursal_id, apartado.inicio_utc, apartado.fin_utc,
        new Date(apartado.fin_utc.getTime() + 300_000), a.ocupaciones[0]]);
      const intento = await db.query(`INSERT INTO intentos_reserva_publica
        (negocio_id,sesion_id,clave,apartado_id,formulario_hash,estado,cita_id)
        VALUES(?,?,?, ?,?,'registrado',?)`,
      [a.id, sesion.insertId, 'intento_historico_001', apartado.id, 'e'.repeat(64), a.ocupaciones[0]]);
      await db.query('UPDATE bloqueos_temporales SET intento_actual_id=? WHERE id=?', [intento.insertId, apartado.id]);
      await db.query("INSERT INTO clientes(negocio_id,nombre_completo,telefono) VALUES(?,'Otra persona histórica','6141234567')", [a.id]);
      const tablas = ['clientes', 'citas', 'bloqueos_temporales', 'sesiones_reserva_publica', 'operaciones_apartado', 'intentos_reserva_publica'];
      const antes = await fotografiar(db, tablas);
      expect(await db.runMigrations({ transaction: 'each' })).toHaveLength(6);
      const despues = await fotografiar(db, tablas);
      for (const tabla of tablas) {
        if (tabla === 'clientes' || tabla === 'citas') {
          expect(despues[tabla].every((fila) => fila.version === 1)).toBe(true);
          despues[tabla] = despues[tabla].map(({ version: _version, ...fila }) => fila);
        }
        expect(despues[tabla]).toEqual(antes[tabla]);
      }
      expect(await db.getRepository('eventos_cita').count()).toBe(0);
      expect(await db.getRepository(Cita).findOneByOrFail({ id: a.ocupaciones[0] }))
        .toMatchObject({ version: 1, costoAceptado: '99.50', nombreContacto: 'Contacto histórico' });
    });
  });

  it.each(['referencia_ajena', 'despues_del_evento'])('T018 revierte todas las filas ante %s', async (punto) => {
    await conBaseOperativa(async (db, segunda) => {
      const { negocios: [a, b] } = await crearEscenarioOperativo(db, new RelojPrueba(AHORA));
      const tablas = ['clientes', 'citas', 'intentos_cita_manual', 'eventos_cita'];
      const antes = await fotografiar(segunda, tablas);
      await expect(db.transaction('READ COMMITTED', async (manager) => {
        const cliente = await manager.getRepository(Cliente).save({ negocioId: a.id, nombreCompleto: 'Revertir', telefono: '6141234567' });
        const base = await manager.getRepository(Cita).findOneByOrFail({ id: a.ocupaciones[0] });
        const cita = await manager.getRepository(Cita).save({ ...base, id: undefined, clienteId: cliente.id, folio: 'M4-ROLLBACK-018' });
        await manager.getRepository('intentos_cita_manual').insert({ negocioId: a.id, actorUsuarioId: a.profesionales[0],
          clave: 'intento_rollback_018', contenidoHash: 'f'.repeat(64) });
        await manager.getRepository('eventos_cita').insert({ negocioId: a.id,
          citaId: punto === 'referencia_ajena' ? b.ocupaciones[0] : cita.id,
          actorUsuarioId: a.profesionales[0], accion: 'alta', versionResultante: 1, valoresDespues: { estado: 'pendiente' } });
        throw new Error('Fallo después de insertar evento');
      // Exigir el error esperado impide acreditar rollback por falta de metadatos previa al evento.
      })).rejects.toThrow(punto === 'referencia_ajena' ? /foreign key constraint fails/i : 'Fallo después de insertar evento');
      expect(await fotografiar(segunda, tablas)).toEqual(antes);
    });
  });

  it.each(['actor', 'cita', 'sesion'])('T018 rechaza referencia ORM ajena de %s sin evento parcial', async (recurso) => {
    await conBaseOperativa(async (db) => {
      const { negocios: [a, b] } = await crearEscenarioOperativo(db, new RelojPrueba(AHORA));
      const sesion = await db.query('INSERT INTO sesiones_reserva_publica(negocio_id,titular_hash) VALUES(?,?)', [b.id, 'a'.repeat(64)]);
      await expect(db.getRepository('eventos_cita').insert({ negocioId: a.id,
        citaId: recurso === 'cita' ? b.ocupaciones[0] : a.ocupaciones[0],
        actorUsuarioId: recurso === 'sesion' ? null : recurso === 'actor' ? b.profesionales[0] : a.profesionales[0],
        sesionPublicaId: recurso === 'sesion' ? Number(sesion.insertId) : null,
        accion: 'alta', versionResultante: 1, valoresDespues: {} })).rejects.toThrow();
      expect(await db.getRepository('eventos_cita').count()).toBe(0);
    });
  });

  it('T019 dos conexiones registran una sola alta pública con identidad comprobada y valores operativos', async () => {
    await conRegistro(async (f) => {
      const [uno, dos] = await Promise.all([
        f.registro.registrar(f.negocioId, f.titular, f.clave, CONTACTO),
        f.otroRegistro.registrar(f.negocioId, f.titular, f.clave, CONTACTO),
      ]);
      expect(dos).toEqual(uno);
      const [cita] = await f.segunda.query('SELECT * FROM citas WHERE folio=?', [uno.folio]);
      const eventos = await f.segunda.query('SELECT * FROM eventos_cita WHERE negocio_id=? AND cita_id=?', [f.negocioId, cita.id]);
      expect(eventos).toHaveLength(1);
      expect(eventos[0]).toMatchObject({ actor_usuario_id: null, sesion_publica_id: f.sesionId,
        accion: 'alta', version_resultante: 1, valores_antes: null, motivo: null, ocurrido_en: AHORA });
      expect(json(eventos[0].valores_despues)).toEqual({ estado: 'pendiente', origen: 'portal_publico',
        folio: uno.folio, clienteId: cita.cliente_id, sucursalId: cita.sucursal_id,
        servicioId: cita.servicio_id, personalId: cita.personal_id, inicioUtc: uno.inicioUtc,
        finUtc: uno.finUtc, zonaHoraria: uno.zonaHoraria, costoAceptado: uno.costoAceptado,
        separacionMinutos: cita.separacion_minutos, finOcupacionUtc: cita.fin_ocupacion_utc.toISOString() });
      const serializado = JSON.stringify(eventos);
      for (const privado of [CONTACTO.nombre, CONTACTO.telefono, CONTACTO.notas, f.titular]) expect(serializado).not.toContain(privado);
      await f.db.query("UPDATE licencias SET vence_en='2026-10-20 12:01:00' WHERE negocio_id=?", [f.negocioId]);
      f.reloj.avanzar(120_000);
      expect(await f.registro.registrar(f.negocioId, f.titular, f.clave, CONTACTO)).toEqual(uno);
      expect(await f.db.getRepository('eventos_cita').count()).toBe(1);
    });
  }, 120000);

  it.each(['evento', 'resultado'])('T019 un fallo en %s revierte cliente, cita, historial y consumo', async (punto) => {
    await conRegistro(async (f) => {
      const tablas = ['clientes', 'citas', 'eventos_cita', 'bloqueos_temporales', 'sesiones_reserva_publica', 'intentos_reserva_publica'];
      const antes = await fotografiar(f.segunda, tablas);
      const sql = punto === 'evento'
        ? "CREATE TRIGGER fallo_m4_019 AFTER INSERT ON eventos_cita FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Fallo de evento M4'"
        : "CREATE TRIGGER fallo_m4_019 BEFORE UPDATE ON intentos_reserva_publica FOR EACH ROW BEGIN IF NEW.estado='registrado' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Fallo de resultado M4'; END IF; END";
      await f.db.query(sql);
      try {
        await expect(f.registro.registrar(f.negocioId, f.titular, f.clave, CONTACTO)).rejects.toThrow();
        expect(await fotografiar(f.segunda, tablas)).toEqual(antes);
      } finally { await f.db.query('DROP TRIGGER fallo_m4_019'); }
      await f.registro.registrar(f.negocioId, f.titular, f.clave, CONTACTO);
      expect(await f.db.getRepository('eventos_cita').count()).toBe(1);
      expect((await f.db.query('SELECT expira_en FROM bloqueos_temporales WHERE id=?', [f.apartadoId]))[0].expira_en)
        .toEqual(antes.bloqueos_temporales.find((fila) => fila.id === f.apartadoId)!.expira_en);
    });
  }, 120000);

  it('T019 una identidad pública ajena no crea cita ni evento', async () => {
    await conRegistro(async (f) => {
      const antes = await fotografiar(f.segunda, ['clientes', 'citas', 'eventos_cita']);
      await expect(f.registro.registrar(f.negocioId, 'f'.repeat(64), f.clave, CONTACTO)).rejects.toThrow();
      expect(await fotografiar(f.segunda, ['clientes', 'citas', 'eventos_cita'])).toEqual(antes);
    });
  }, 120000);
});
