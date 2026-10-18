import { conBaseMigrada } from './support/mariadb';
import { crearEscenarioPortal } from './support/escenario-portal';
import { RelojPrueba } from './support/reloj';
import type { DataSource } from 'typeorm';

const migracionesPortal = [
  'SesionesReservaPublica1760000026000',
  'OperacionesApartado1760000027000',
  'ContextoApartadosPublicos1760000028000',
  'TelefonosCompartidos1760000029000',
  'HistoriaCitasPublicas1760000030000',
  'IntentosReservaPublica1760000031000',
];

async function columnas(db: DataSource, tabla: string): Promise<string[]> {
  return (await db.query(`SHOW COLUMNS FROM ${tabla}`))
    .map((fila: { Field: string }) => fila.Field);
}

describe('M3-T008–T013: migraciones iniciales del portal', () => {
  it('crea sesiones por negocio y hash, generación y puntero anulable, sin token', async () => {
    await conBaseMigrada(async (db) => {
      const { negocios } = await crearEscenarioPortal(db,
        new RelojPrueba(new Date('2026-10-20T12:00:00Z')));
      expect(await columnas(db, 'sesiones_reserva_publica')).toEqual(expect.arrayContaining([
        'id', 'negocio_id', 'titular_hash', 'generacion', 'apartado_actual_id',
        'creado_en', 'actualizado_en',
      ]));
      expect(await columnas(db, 'sesiones_reserva_publica')).not.toContain('token');
      const insertar = 'INSERT INTO sesiones_reserva_publica (negocio_id,titular_hash) VALUES (?,?)';
      const hash = 'a'.repeat(64);
      await db.query(insertar, [negocios[0].id, hash]);
      await expect(db.query(insertar, [negocios[0].id, hash])).rejects.toThrow();
      await db.query(insertar, [negocios[1].id, hash]);
      const filas = await db.query('SELECT generacion, apartado_actual_id FROM sesiones_reserva_publica');
      expect(filas).toHaveLength(2);
      expect(Number(filas[0].generacion)).toBe(0);
      expect(filas[0].apartado_actual_id).toBeNull();
    });
  });

  it('deduplica operaciones por sesión y permite la misma clave en otra sesión', async () => {
    await conBaseMigrada(async (db) => {
      const { negocios } = await crearEscenarioPortal(db,
        new RelojPrueba(new Date('2026-10-20T12:00:00Z')));
      const negocio = negocios[0];
      const sesiones = [];
      for (const hash of ['b'.repeat(64), 'c'.repeat(64)]) {
        const alta = await db.query('INSERT INTO sesiones_reserva_publica (negocio_id,titular_hash) VALUES (?,?)',
          [negocio.id, hash]);
        sesiones.push(Number(alta.insertId));
      }
      const insertar = `INSERT INTO operaciones_apartado
        (negocio_id,sesion_id,clave,generacion,seleccion_hash,personal_id,
         sucursal_id,servicio_id,fecha_local,hora_inicio)
        VALUES (?,?,?,?,?,?,?,?,?,?)`;
      const datos = [negocio.id, sesiones[0], 'clave-uno', 1, 'd'.repeat(64),
        negocio.profesionales[0], negocio.sucursales[0].id,
        negocio.servicioInactivoId, '2026-10-20', '10:00'];
      await db.query(insertar, datos);
      await expect(db.query(insertar, datos)).rejects.toThrow();
      await db.query(insertar, [negocio.id, sesiones[1], ...datos.slice(2)]);
      const filas = await db.query('SELECT estado, apartado_id, causa_publica FROM operaciones_apartado');
      expect(filas).toHaveLength(2);
      expect(filas[0]).toMatchObject({ estado: 'preparada', apartado_id: null, causa_publica: null });
    });
  });

  it('conserva datos anteriores al actualizar y admite teléfono compartido', async () => {
    await conBaseMigrada(async (db) => {
      // Retrocede solo las seis migraciones de este lote para simular fase 3.
      for (const nombre of [...migracionesPortal].reverse()) {
        const [ultima] = await db.query('SELECT name FROM migrations ORDER BY timestamp DESC LIMIT 1');
        expect(ultima.name).toBe(nombre);
        await db.undoLastMigration({ transaction: 'each' });
      }
      const { negocios } = await crearEscenarioPortal(db,
        new RelojPrueba(new Date('2026-10-20T12:00:00Z')));
      const previo = await db.query('SELECT id,negocio_id,nombre_completo,telefono FROM clientes ORDER BY id');
      const citas = await db.query('SELECT id,folio,estado,inicio_utc,fin_utc FROM citas ORDER BY id');
      const apartados = await db.query('SELECT id,inicio_utc,fin_utc,expira_en,titular_hash FROM bloqueos_temporales ORDER BY id');
      await db.runMigrations({ transaction: 'each' });
      expect(await db.query('SELECT id,negocio_id,nombre_completo,telefono FROM clientes ORDER BY id'))
        .toEqual(previo);
      expect(await db.query('SELECT id,folio,estado,inicio_utc,fin_utc FROM citas ORDER BY id'))
        .toEqual(citas);
      expect(await db.query('SELECT id,inicio_utc,fin_utc,expira_en,titular_hash FROM bloqueos_temporales ORDER BY id'))
        .toEqual(apartados);
      const [cita] = await db.query('SELECT * FROM citas ORDER BY id LIMIT 1');
      expect([cita.costo_aceptado, cita.nombre_contacto, cita.telefono_contacto,
        cita.nombre_negocio, cita.nombre_servicio, cita.nombre_sucursal,
        cita.nombre_profesional]).toEqual(Array(7).fill(null));
      const [apartado] = await db.query('SELECT * FROM bloqueos_temporales ORDER BY id LIMIT 1');
      expect([apartado.costo_aceptado, apartado.zona_horaria_apartado,
        apartado.sesion_id, apartado.generacion, apartado.operacion_id])
        .toEqual(Array(5).fill(null));
      const duplicado = await db.query(`INSERT INTO clientes
        (negocio_id,nombre_completo,telefono) VALUES (?,'Otra persona','6141234567')`,
      [negocios[0].id]);
      expect(Number(duplicado.insertId)).toBeGreaterThan(0);
      // Los valores futuros se guardan como decimal exacto sin tocar el historial viejo.
      await db.query(`UPDATE bloqueos_temporales SET costo_aceptado='123.45',
        zona_horaria_apartado='America/Chihuahua' WHERE id=?`, [apartado.id]);
      await db.query(`UPDATE citas SET costo_aceptado='123.45', nombre_contacto='Otra persona',
        telefono_contacto='6141234567', nombre_negocio='Portal 1',
        nombre_servicio='Corte', nombre_sucursal='Centro',
        nombre_profesional='Profesional 1' WHERE id=?`, [cita.id]);
      expect((await db.query('SELECT costo_aceptado FROM bloqueos_temporales WHERE id=?',
        [apartado.id]))[0].costo_aceptado).toBe('123.45');
      expect((await db.query('SELECT costo_aceptado,nombre_contacto FROM citas WHERE id=?',
        [cita.id]))[0]).toMatchObject({ costo_aceptado: '123.45', nombre_contacto: 'Otra persona' });
      expect(Number((await db.query('SHOW INDEX FROM clientes WHERE Key_name = ?',
        ['idx_cliente_por_negocio_telefono']))[0].Non_unique)).toBe(1);
    });
  });

  it('guarda intentos terminales y unicidad de clave y cita no nula', async () => {
    await conBaseMigrada(async (db) => {
      const { negocios } = await crearEscenarioPortal(db,
        new RelojPrueba(new Date('2026-10-20T12:00:00Z')));
      const negocio = negocios[0];
      const sesion = await db.query('INSERT INTO sesiones_reserva_publica (negocio_id,titular_hash) VALUES (?,?)',
        [negocio.id, 'e'.repeat(64)]);
      const sesionId = Number(sesion.insertId);
      const insertar = `INSERT INTO intentos_reserva_publica
        (negocio_id,sesion_id,clave,apartado_id,formulario_hash)
        VALUES (?,?,?,?,?)`;
      await db.query(insertar, [negocio.id, sesionId, 'intento-uno',
        negocio.ocupaciones[1], 'f'.repeat(64)]);
      await expect(db.query(insertar, [negocio.id, sesionId, 'intento-uno',
        negocio.ocupaciones[1], 'f'.repeat(64)])).rejects.toThrow();
      await db.query(insertar, [negocio.id, sesionId, 'intento-dos',
        negocio.ocupaciones[1], '0'.repeat(64)]);
      const registros = await db.query('SELECT id,estado,cita_id FROM intentos_reserva_publica ORDER BY id');
      expect(registros.map((fila: { estado: string }) => fila.estado))
        .toEqual(['preparado', 'preparado']);
      await db.query("UPDATE intentos_reserva_publica SET estado='registrado', cita_id=? WHERE id=?",
        [negocio.ocupaciones[0], registros[0].id]);
      await expect(db.query("UPDATE intentos_reserva_publica SET estado='registrado', cita_id=? WHERE id=?",
        [negocio.ocupaciones[0], registros[1].id])).rejects.toThrow();
      await db.query("UPDATE intentos_reserva_publica SET estado='no_registrado', causa_publica='apartado_vencido' WHERE id=?",
        [registros[1].id]);
      const final = await db.query('SELECT estado,causa_publica FROM intentos_reserva_publica WHERE id=?',
        [registros[1].id]);
      expect(final[0]).toMatchObject({ estado: 'no_registrado', causa_publica: 'apartado_vencido' });
    });
  });
});
