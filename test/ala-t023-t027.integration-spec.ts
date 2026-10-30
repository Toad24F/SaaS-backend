import { conBaseMigrada } from './support/mariadb';
import { crearEscenarioPortal } from './support/escenario-portal';
import { RelojPrueba } from './support/reloj';

const reloj = () => new RelojPrueba(new Date('2026-10-20T12:00:00Z'));

describe('ALA-T023–T027: origen y sucesión en base desechable', () => {
  it('impide dos citas del mismo apartado y conserva teléfonos compartidos', async () => {
    // La unicidad recae en el apartado, no en el teléfono ni en la persona.
    await conBaseMigrada(async (db) => {
      const { negocios } = await crearEscenarioPortal(db, reloj());
      const [a, b] = negocios;
      const [cita] = await db.query('SELECT * FROM citas WHERE id=?', [a.ocupaciones[0]]);
      await db.query("UPDATE citas SET origen='portal_publico',apartado_origen_id=? WHERE id=?",
        [a.ocupaciones[1], a.ocupaciones[0]]);
      await expect(db.query(`INSERT INTO citas
        (negocio_id,sucursal_id,personal_id,servicio_id,cliente_id,inicio_utc,fin_utc,
         zona_horaria_reserva,folio,estado,origen,apartado_origen_id)
        VALUES (?,?,?,?,?,?,?,?,?,'pendiente','portal_publico',?)`,
      [a.id, cita.sucursal_id, cita.personal_id, cita.servicio_id, cita.cliente_id,
        cita.inicio_utc, cita.fin_utc, cita.zona_horaria_reserva, 'ALA-DUP', a.ocupaciones[1]]))
        .rejects.toBeDefined();
      await expect(db.query("UPDATE citas SET origen='portal_publico',apartado_origen_id=? WHERE id=?",
        [a.ocupaciones[1], b.ocupaciones[0]])).rejects.toBeDefined();
      const cliente2 = Number((await db.query('INSERT INTO clientes (negocio_id,nombre_completo,telefono) VALUES (?,?,?)',
        [a.id, 'Persona distinta', a.telefonoCliente])).insertId);
      await db.query(`INSERT INTO citas
        (negocio_id,sucursal_id,personal_id,servicio_id,cliente_id,inicio_utc,fin_utc,
         zona_horaria_reserva,folio,estado,origen)
        VALUES (?,?,?,?,?,?,?,?,?,'pendiente','portal_publico')`,
      [a.id, cita.sucursal_id, cita.personal_id, cita.servicio_id, cliente2,
        cita.inicio_utc, cita.fin_utc, cita.zona_horaria_reserva, 'ALA-OTRA']);
      const [conteo] = await db.query(`SELECT COUNT(*) total,
        COUNT(DISTINCT cliente_id) personas FROM citas WHERE negocio_id=?`, [a.id]);
      expect(Number(conteo.total)).toBe(2);
      expect(Number(conteo.personas)).toBe(2);
      expect(Number((await db.query('SELECT COUNT(*) total FROM citas WHERE apartado_origen_id=?',
        [a.ocupaciones[1]]))[0].total)).toBe(1);
    });
  });

  it('crea el puntero en orden, rechaza cruce de negocio y dos sucesores', async () => {
    // Primero existe el intento; después el apartado puede señalarlo con su FK.
    await conBaseMigrada(async (db) => {
      const { negocios } = await crearEscenarioPortal(db, reloj());
      const [a, b] = negocios;
      const sesion = async (negocioId: number, hash: string) => Number((await db.query(
        'INSERT INTO sesiones_reserva_publica (negocio_id,titular_hash) VALUES (?,?)',
        [negocioId, hash.repeat(64)])).insertId);
      const sesionA = await sesion(a.id, 'a');
      const sesionB = await sesion(b.id, 'b');
      const insertar = async (negocioId: number, sesionId: number, apartadoId: number,
        clave: string, anterior: number | null = null) => Number((await db.query(`INSERT INTO intentos_reserva_publica
          (negocio_id,sesion_id,apartado_id,clave,intento_anterior_id)
          VALUES (?,?,?,?,?)`, [negocioId, sesionId, apartadoId, clave, anterior])).insertId);
      const primero = await insertar(a.id, sesionA, a.ocupaciones[1], 'intento-primero');
      await db.query('UPDATE bloqueos_temporales SET intento_actual_id=? WHERE id=?',
        [primero, a.ocupaciones[1]]);
      const sucesor = await insertar(a.id, sesionA, a.ocupaciones[1], 'intento-sucesor', primero);
      await db.query('UPDATE bloqueos_temporales SET intento_actual_id=? WHERE id=?',
        [sucesor, a.ocupaciones[1]]);
      await expect(insertar(a.id, sesionA, a.ocupaciones[1], 'otro-sucesor', primero))
        .rejects.toBeDefined();
      await expect(insertar(b.id, sesionB, b.ocupaciones[1], 'cruce', primero))
        .rejects.toBeDefined();
      const ajeno = await insertar(b.id, sesionB, b.ocupaciones[1], 'ajeno');
      await expect(db.query('UPDATE bloqueos_temporales SET intento_actual_id=? WHERE id=?',
        [ajeno, a.ocupaciones[1]])).rejects.toBeDefined();
      const [puntero] = await db.query('SELECT intento_actual_id FROM bloqueos_temporales WHERE id=?',
        [a.ocupaciones[1]]);
      expect(Number(puntero.intento_actual_id)).toBe(sucesor);
    });
  });
});
