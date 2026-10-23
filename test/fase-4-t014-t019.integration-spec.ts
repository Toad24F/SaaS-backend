import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { conBaseMigrada } from './support/mariadb';
import { crearEscenarioPortal } from './support/escenario-portal';
import { RelojPrueba } from './support/reloj';
import { BloqueoTemporal } from '../src/disponibilidad/entities/bloqueo-temporal.entity';
import { Cliente } from '../src/disponibilidad/entities/cliente.entity';
import { Cita } from '../src/disponibilidad/entities/cita.entity';
import { SesionReservaPublica } from '../src/reservas-publicas/entities/sesion-reserva-publica.entity';
import { OperacionApartado } from '../src/reservas-publicas/entities/operacion-apartado.entity';
import { IntentoReservaPublica } from '../src/reservas-publicas/entities/intento-reserva-publica.entity';

const FECHA = new Date('2026-10-20T12:00:00.000Z');

describe('M3-T014–T019: relaciones y entidades públicas', () => {
  it('admite creación ordenada del ciclo y rechaza cruces de negocio', async () => {
    await conBaseMigrada(async (db) => {
      const { negocios: [a, b] } = await crearEscenarioPortal(db, new RelojPrueba(FECHA));
      const insertarSesion = 'INSERT INTO sesiones_reserva_publica (negocio_id,titular_hash) VALUES (?,?)';
      const sesionA = Number((await db.query(insertarSesion, [a.id, '1'.repeat(64)])).insertId);
      const sesionB = Number((await db.query(insertarSesion, [b.id, '2'.repeat(64)])).insertId);
      const insertarOperacion = `INSERT INTO operaciones_apartado
        (negocio_id,sesion_id,clave,generacion,seleccion_hash,personal_id,
         sucursal_id,servicio_id,fecha_local,hora_inicio)
        VALUES (?,?,?,?,?,?,?,?,?,?)`;
      const seleccion = [a.id, sesionA, 'op-a', 1, '3'.repeat(64),
        a.profesionales[0], a.sucursales[0].id, a.servicioInactivoId,
        '2026-10-20', '10:00'];
      const operacionA = Number((await db.query(insertarOperacion, seleccion)).insertId);
      // La operación aún no apunta a un apartado: permite confirmar fase 1 antes de fase 2.
      expect((await db.query('SELECT apartado_id FROM operaciones_apartado WHERE id=?',
        [operacionA]))[0].apartado_id).toBeNull();
      const apartadoA = a.ocupaciones[1];
      await db.query(`UPDATE bloqueos_temporales SET sesion_id=?, generacion=1,
        operacion_id=? WHERE id=?`, [sesionA, operacionA, apartadoA]);
      await db.query('UPDATE operaciones_apartado SET apartado_id=?, estado=? WHERE id=?',
        [apartadoA, 'concedida', operacionA]);
      await db.query('UPDATE sesiones_reserva_publica SET apartado_actual_id=?, generacion=1 WHERE id=?',
        [apartadoA, sesionA]);
      await db.query(`INSERT INTO intentos_reserva_publica
        (negocio_id,sesion_id,clave,apartado_id) VALUES (?,?,?,?)`,
      [a.id, sesionA, 'intento-a', apartadoA]);

      // Cada FK compuesta debe comprobar negocio_id además del ID de destino.
      await expect(db.query('UPDATE sesiones_reserva_publica SET apartado_actual_id=? WHERE id=?',
        [b.ocupaciones[1], sesionA])).rejects.toThrow();
      await expect(db.query(insertarOperacion, [a.id, sesionA, 'op-cruzada', 2,
        '4'.repeat(64), b.profesionales[0], a.sucursales[0].id,
        a.servicioInactivoId, '2026-10-20', '11:00'])).rejects.toThrow();
      await expect(db.query(insertarOperacion, [a.id, sesionA, 'op-sucursal', 2,
        '4'.repeat(64), a.profesionales[0], b.sucursales[0].id,
        a.servicioInactivoId, '2026-10-20', '11:00'])).rejects.toThrow();
      await expect(db.query(insertarOperacion, [a.id, sesionA, 'op-servicio', 2,
        '4'.repeat(64), a.profesionales[0], a.sucursales[0].id,
        b.servicioInactivoId, '2026-10-20', '11:00'])).rejects.toThrow();
      await expect(db.query('UPDATE operaciones_apartado SET apartado_id=? WHERE id=?',
        [b.ocupaciones[1], operacionA])).rejects.toThrow();
      await expect(db.query('UPDATE bloqueos_temporales SET sesion_id=? WHERE id=?',
        [sesionB, apartadoA])).rejects.toThrow();
      await expect(db.query('UPDATE bloqueos_temporales SET operacion_id=? WHERE id=?',
        [Number((await db.query(insertarOperacion, [b.id, sesionB, 'op-b', 1,
          '5'.repeat(64), b.profesionales[0], b.sucursales[0].id,
          b.servicioInactivoId, '2026-10-20', '10:00'])).insertId), apartadoA]))
        .rejects.toThrow();
      await expect(db.query(`INSERT INTO intentos_reserva_publica
        (negocio_id,sesion_id,clave,apartado_id) VALUES (?,?,?,?)`,
      [a.id, sesionA, 'intento-cruzado', b.ocupaciones[1]])).rejects.toThrow();
      await expect(db.query('UPDATE intentos_reserva_publica SET cita_id=? WHERE clave=?',
        [b.ocupaciones[0], 'intento-a'])).rejects.toThrow();
      expect((await db.query('SELECT COUNT(*) total FROM citas WHERE id=?',
        [a.ocupaciones[0]]))[0].total).toBe('1');
      const reglas = await db.query(`SELECT DELETE_RULE FROM information_schema.REFERENTIAL_CONSTRAINTS
        WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='intentos_reserva_publica'
          AND REFERENCED_TABLE_NAME='citas'`);
      expect(reglas[0].DELETE_RULE).toBe('RESTRICT');
    });
  });

  it('lee legado sin inventar precio y conserva snapshots con TypeORM', async () => {
    await conBaseMigrada(async (db) => {
      const { negocios: [a] } = await crearEscenarioPortal(db, new RelojPrueba(FECHA));
      const apartado = await db.getRepository(BloqueoTemporal)
        .findOneByOrFail({ id: a.ocupaciones[1] });
      const cita = await db.getRepository(Cita).findOneByOrFail({ id: a.ocupaciones[0] });
      expect(apartado).toMatchObject({ costoAceptado: null,
        zonaHorariaApartado: null, sesionId: null, generacion: null,
        operacionId: null });
      expect(cita).toMatchObject({ costoAceptado: null, nombreContacto: null,
        telefonoContacto: null, nombreNegocio: null, nombreServicio: null,
        nombreSucursal: null, nombreProfesional: null, estado: 'pendiente' });
      const cliente = await db.getRepository(Cliente).save({ negocioId: a.id,
        nombreCompleto: 'Familiar', telefono: a.telefonoCliente, email: null });
      expect(cliente.id).toBeGreaterThan(0);
      expect((await db.getRepository(Cliente).find({
        where: { negocioId: a.id, telefono: a.telefonoCliente },
      })).map((fila) => fila.nombreCompleto).sort()).toEqual(['Cliente 1', 'Familiar']);
      await db.getRepository(Cita).update({ id: cita.id }, {
        costoAceptado: '123.45', nombreContacto: 'Familiar',
        telefonoContacto: a.telefonoCliente, nombreNegocio: 'Portal 1',
        nombreServicio: 'Corte', nombreSucursal: 'Centro',
        nombreProfesional: 'Profesional 1',
      });
      const leida = await db.getRepository(Cita).findOneByOrFail({ id: cita.id });
      expect(leida).toMatchObject({ costoAceptado: '123.45',
        nombreContacto: 'Familiar', estado: 'pendiente' });
      expect(leida.inicioUtc).toEqual(cita.inicioUtc);
      expect(leida.finUtc).toEqual(cita.finUtc);
      expect(leida.zonaHorariaReserva).toBe(cita.zonaHorariaReserva);
      for (const entidad of [SesionReservaPublica, OperacionApartado,
        IntentoReservaPublica]) {
        expect(db.getRepository(entidad).metadata.tableName).toMatch(/reserva_publica|apartado/);
      }
    });
  });

  it('registra metadatos de sesión, operación, apartado, cliente, cita e intento', async () => {
    await conBaseMigrada(async (db) => {
      const tablas = ['sesiones_reserva_publica', 'operaciones_apartado',
        'bloqueos_temporales', 'clientes', 'citas', 'intentos_reserva_publica'];
      for (const tabla of tablas) expect(db.hasMetadata(tabla)).toBe(true);
      const sesion = db.getMetadata('sesiones_reserva_publica');
      expect(sesion.columns.map((columna) => columna.databaseName)).not.toContain('token');
      const cliente = db.getMetadata('clientes');
      expect(cliente.indices.find((indice) => indice.givenName ===
        'idx_cliente_por_negocio_telefono')?.isUnique).toBe(false);
      const cita = db.getMetadata('citas');
      expect(cita.columns.map((columna) => columna.databaseName)).toEqual(expect.arrayContaining([
        'costo_aceptado', 'nombre_contacto', 'telefono_contacto', 'nombre_negocio',
        'nombre_servicio', 'nombre_sucursal', 'nombre_profesional',
      ]));
      const intento = db.getMetadata('intentos_reserva_publica');
      expect(intento.columns.find((columna) => columna.databaseName === 'estado')?.enum)
        .toEqual(['preparado', 'registrado', 'no_registrado']);
      expect(await db.runMigrations({ transaction: 'each' })).toEqual([]);
    });
  });

  it('la aplicación descubre las nuevas entidades sin habilitar rutas públicas', async () => {
    await conBaseMigrada(async (db) => {
      const original = { nombre: process.env.TEST_DB_NAME,
        confirmado: process.env.TEST_DB_CONFIRMED };
      process.env.TEST_DB_NAME = String(db.options.database);
      process.env.TEST_DB_CONFIRMED = String(db.options.database);
      try {
        const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
        try {
          const conexion = modulo.get(DataSource);
          expect(conexion.hasMetadata('sesiones_reserva_publica')).toBe(true);
          expect(conexion.hasMetadata('operaciones_apartado')).toBe(true);
          expect(conexion.hasMetadata('intentos_reserva_publica')).toBe(true);
        } finally { await modulo.close(); }
      } finally {
        process.env.TEST_DB_NAME = original.nombre;
        process.env.TEST_DB_CONFIRMED = original.confirmado;
      }
    });
  });
});
