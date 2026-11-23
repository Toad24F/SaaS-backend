import { conBaseOperativa, crearEscenarioOperativo } from './support/operacion-fase-5';
import { RelojPrueba } from './support/reloj';
import { retrocederHastaMigracion, limitarMigracionesHasta } from './support/mariadb';
import { ConfiguracionAutomatizaciones } from '../src/automatizaciones/entities/configuracion-automatizaciones.entity';
import { CondicionConfirmacionCita } from '../src/automatizaciones/entities/condicion-confirmacion-cita.entity';

const ahora = new Date('2026-11-22T12:00:00.000Z');

describe('M5-T054–T058: persistencia de automatizaciones y actores', () => {
  it('mantiene entidades y DDL con columnas y restricciones de pertenencia equivalentes', async () => {
    await conBaseOperativa(async db => {
      for (const entidad of [ConfiguracionAutomatizaciones, CondicionConfirmacionCita]) {
        const meta = db.getMetadata(entidad);
        const columnas = await db.query(`SHOW COLUMNS FROM ${meta.tableName}`);
        expect(meta.columns.map(columna => columna.databaseName).sort())
          .toEqual(columnas.map((columna: { Field: string }) => columna.Field).sort());
      }
      const foraneas = await db.query(`SELECT CONSTRAINT_NAME nombre FROM information_schema.TABLE_CONSTRAINTS
        WHERE TABLE_SCHEMA=DATABASE() AND CONSTRAINT_TYPE='FOREIGN KEY'
        AND TABLE_NAME IN ('configuracion_automatizaciones','condiciones_confirmacion_cita','citas')`);
      expect(foraneas.map((fila: { nombre: string }) => fila.nombre))
        .toEqual(expect.arrayContaining(['fk_ca_negocio', 'fk_ccc_cita', 'fk_citas_condicion_vigente']));
    });
  });

  it('actualiza citas y eventos previos sin reconstruir snapshots ni inventar condiciones', async () => {
    await conBaseOperativa(async db => {
      await retrocederHastaMigracion(db, 'IdentidadActivaClientes1760000053000');
      // Esta prueba histórica termina en T058; las migraciones posteriores se prueban aparte.
      limitarMigracionesHasta(db, 'ActoresEventosCita1760000057000');
      const { negocios: [a] } = await crearEscenarioOperativo(db, new RelojPrueba(ahora));
      const cita = a.ocupaciones[0];
      const anterior = (await db.query('SELECT * FROM citas WHERE id=?', [cita]))[0];
      const evento = await db.query(`INSERT INTO eventos_cita
        (negocio_id,cita_id,actor_usuario_id,accion,version_resultante,valores_despues)
        VALUES (?,?,?,'alta',1,'{}')`, [a.id, cita, a.profesionales[0]]);
      expect((await db.runMigrations({ transaction: 'each' })).map(migracion => migracion.name))
        .toEqual(['ConfiguracionAutomatizaciones1760000054000', 'PersonalizacionPortal1760000054500',
          'CondicionesConfirmacionCita1760000055000',
          'ReferenciaCondicionCita1760000056000', 'ActoresEventosCita1760000057000']);
      const nueva = (await db.query('SELECT * FROM citas WHERE id=?', [cita]))[0];
      for (const [campo, valor] of Object.entries(anterior)) expect(nueva[campo]).toEqual(valor);
      expect(nueva).toMatchObject({ generacion_automatizacion: null, condicion_vigente_id: null, causa_cancelacion: null });
      expect(await db.query('SELECT id FROM condiciones_confirmacion_cita')).toEqual([]);
      expect((await db.query('SELECT actor_tipo FROM eventos_cita WHERE id=?', [evento.insertId]))[0].actor_tipo).toBe('usuario');
    });
  });

  it('T054 conserva citas previas y limita configuración a enteros 6–24 / 12–48', async () => {
    await conBaseOperativa(async db => {
      const { negocios: [a] } = await crearEscenarioOperativo(db, new RelojPrueba(ahora));
      const cita = a.ocupaciones[0];
      const anterior = (await db.query('SELECT * FROM citas WHERE id=?', [cita]))[0];
      await db.query('INSERT INTO configuracion_automatizaciones (negocio_id) VALUES (?)', [a.id]);
      expect((await db.query('SELECT plazo_confirmacion_horas,recordatorio_horas,version FROM configuracion_automatizaciones WHERE negocio_id=?', [a.id]))[0])
        .toMatchObject({ plazo_confirmacion_horas: 12, recordatorio_horas: 24, version: 1 });
      for (const [plazo, recordatorio] of [[5, 24], [25, 24], [12, 11], [12, 49]]) {
        await expect(db.query('UPDATE configuracion_automatizaciones SET plazo_confirmacion_horas=?,recordatorio_horas=? WHERE negocio_id=?', [plazo, recordatorio, a.id])).rejects.toThrow();
      }
      const columnas = await db.query('SHOW COLUMNS FROM configuracion_automatizaciones');
      expect(columnas.find((fila: { Field: string }) => fila.Field === 'plazo_confirmacion_horas').Type).toBe('tinyint(3) unsigned');
      expect(columnas.find((fila: { Field: string }) => fila.Field === 'recordatorio_horas').Type).toBe('tinyint(3) unsigned');
      expect((await db.query('SELECT * FROM citas WHERE id=?', [cita]))[0]).toEqual(anterior);
    });
  });

  it('T055–T056 conserva generaciones históricas y referencia solo la propia condición', async () => {
    await conBaseOperativa(async db => {
      const { negocios: [a, b] } = await crearEscenarioOperativo(db, new RelojPrueba(ahora));
      const cita = a.ocupaciones[0];
      const insertar = (generacion: number) => db.query(`INSERT INTO condiciones_confirmacion_cita
        (negocio_id,cita_id,generacion,categoria,instante_base,plazo_aplicado_minutos,vencimiento_utc,
         motivo_seguimiento,estado_politica,version_configuracion)
        VALUES (?,?,?,'manual_heredada',?,NULL,NULL,'Reserva heredada','seguimiento_manual',NULL)`,
      [a.id, cita, generacion, ahora]);
      const primera = await insertar(1);
      const segunda = await insertar(2);
      await db.query('UPDATE citas SET generacion_automatizacion=2,condicion_vigente_id=? WHERE id=?', [segunda.insertId, cita]);
      expect((await db.query('SELECT generacion_automatizacion,condicion_vigente_id FROM citas WHERE id=?', [cita]))[0])
        .toMatchObject({ generacion_automatizacion: 2, condicion_vigente_id: String(segunda.insertId) });
      expect(await db.query('SELECT id FROM condiciones_confirmacion_cita WHERE cita_id=?', [cita])).toHaveLength(2);
      await expect(db.query('UPDATE citas SET generacion_automatizacion=1,condicion_vigente_id=? WHERE id=?', [segunda.insertId, cita])).rejects.toThrow();
      await expect(db.query('UPDATE citas SET negocio_id=?,generacion_automatizacion=1,condicion_vigente_id=? WHERE id=?', [b.id, primera.insertId, cita])).rejects.toThrow();
      await expect(db.query('UPDATE citas SET causa_cancelacion=? WHERE id=?', ['falta_confirmacion_plazo', cita])).rejects.toThrow();
    });
  });

  it('T057–T058 acepta cuatro actores excluyentes, rechaza incompatibles y conserva eventos inmutables', async () => {
    await conBaseOperativa(async db => {
      const { negocios: [a] } = await crearEscenarioOperativo(db, new RelojPrueba(ahora));
      const cita = a.ocupaciones[0];
      const sesion = Number((await db.query(`INSERT INTO sesiones_reserva_publica
        (negocio_id,titular_hash) VALUES(?,?)`, [a.id, 'a'.repeat(64)])).insertId);
      const insertar = (version: number, usuario: number | null, sesionId: number | null,
        whatsapp: string | null, proceso: string | null, accion: string) => db.query(`INSERT INTO eventos_cita
        (negocio_id,cita_id,actor_usuario_id,sesion_publica_id,referencia_whatsapp,proceso_sistema,
         accion,version_resultante,valores_despues)
        VALUES (?,?,?,?,?,?,?,?,?)`, [a.id, cita, usuario, sesionId, whatsapp, proceso, accion, version, '{}']);
      const usuario = await insertar(1, a.profesionales[0], null, null, null, 'alta');
      await insertar(2, null, sesion, null, null, 'alta');
      await insertar(3, null, null, 'wa-msg-externo', null, 'cambio_estado');
      await insertar(4, null, null, null, 'cancelador', 'cancelacion');
      expect((await db.query('SELECT actor_tipo FROM eventos_cita WHERE cita_id=? ORDER BY version_resultante', [cita]))
        .map((fila: { actor_tipo: string }) => fila.actor_tipo))
        .toEqual(['usuario', 'sesion_publica', 'cliente_whatsapp', 'sistema']);
      await expect(insertar(5, a.profesionales[0], null, 'wa-duplicado', null, 'cambio_estado')).rejects.toThrow();
      await expect(insertar(5, null, null, null, null, 'cancelacion')).rejects.toThrow();
      await expect(insertar(5, null, null, 'wa-alta', null, 'alta')).rejects.toThrow();
      await expect(insertar(5, null, null, null, 'cancelador', 'alta')).rejects.toThrow();
      await expect(insertar(4, null, null, 'wa-otro', null, 'cambio_estado')).rejects.toThrow();
      await expect(db.query('UPDATE eventos_cita SET motivo=? WHERE id=?', ['alterado', usuario.insertId])).rejects.toThrow('inmutable');
      await expect(db.query('DELETE FROM eventos_cita WHERE id=?', [usuario.insertId])).rejects.toThrow('inmutable');
    });
  });
});
