import { CoordinacionReservaPublicaService } from '../src/reservas-publicas/coordinacion-reserva-publica.service';
import { IntentosReservaPublicaService } from '../src/reservas-publicas/intentos-reserva-publica.service';
import { conBaseMigrada } from './support/mariadb';
import { crearEscenarioPortal } from './support/escenario-portal';
import { RelojPrueba } from './support/reloj';

describe('M3-T072–T073: intento propio y resultado durable', () => {
  // Las filas se crean en una base migrada desechable para probar FKs y unicidad reales.
  it('prepara una sola fila, conserva el plazo y rechaza titular o apartado ajenos', async () => {
    await conBaseMigrada(async (db) => {
      const reloj = new RelojPrueba(new Date('2026-10-20T12:00:00Z'));
      const { negocios: [a, b] } = await crearEscenarioPortal(db, reloj);
      const titular = 'a'.repeat(64);
      const sesion = await db.query(`INSERT INTO sesiones_reserva_publica
        (negocio_id,titular_hash,generacion) VALUES (?,?,1)`, [a.id, titular]);
      const sesionId = Number(sesion.insertId);
      const servicio = Number((await db.query('SELECT id FROM servicios WHERE negocio_id=? AND activo=1',
        [a.id]))[0].id);
      const expira = new Date('2026-10-20T12:05:00Z');
      const apartado = await db.query(`INSERT INTO bloqueos_temporales
        (negocio_id,personal_id,sucursal_id,servicio_id,inicio_utc,fin_utc,
        expira_en,titular_hash,costo_aceptado,zona_horaria_apartado,sesion_id,generacion)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,1)`, [a.id, a.profesionales[0], a.sucursales[0].id,
        servicio, new Date('2026-10-20T15:00:00Z'), new Date('2026-10-20T15:30:00Z'),
        expira, titular, '100.00', a.sucursales[0].zona, sesionId]);
      const apartadoId = Number(apartado.insertId);
      await db.query('UPDATE sesiones_reserva_publica SET apartado_actual_id=? WHERE id=?',
        [apartadoId, sesionId]);
      const coordinacion = new CoordinacionReservaPublicaService(db, reloj);
      const servicioIntentos = new IntentosReservaPublicaService(db, coordinacion, reloj);
      const clave = 'intento_de_prueba_12345';
      const primera = await servicioIntentos.preparar(a.id, titular, { clave, apartadoId });
      const segunda = await servicioIntentos.preparar(a.id, titular, { clave, apartadoId });
      expect(segunda).toEqual(primera);
      expect((await db.query('SELECT COUNT(*) AS total FROM intentos_reserva_publica'))[0].total)
        .toBe('1');
      expect(new Date((await db.query('SELECT expira_en FROM bloqueos_temporales WHERE id=?',
        [apartadoId]))[0].expira_en).toISOString()).toBe(expira.toISOString());
      reloj.fijar(expira);
      expect(await servicioIntentos.preparar(a.id, titular, { clave, apartadoId }))
        .toEqual(primera);
      await expect(servicioIntentos.preparar(a.id, titular,
        { clave: 'intento_nuevo_vencido_123', apartadoId })).rejects.toThrow();
      await expect(servicioIntentos.preparar(a.id, 'b'.repeat(64), { clave, apartadoId }))
        .rejects.toThrow();
      await expect(servicioIntentos.preparar(b.id, titular, { clave, apartadoId }))
        .rejects.toThrow();
      await expect(servicioIntentos.preparar(a.id, titular,
        { clave, apartadoId: a.ocupaciones[1] })).rejects.toThrow();
    });
  }, 120000);

  it('recupera el registrado con el mismo contenido aunque venza el apartado', async () => {
    await conBaseMigrada(async (db) => {
      const reloj = new RelojPrueba(new Date('2026-10-20T12:00:00Z'));
      const { negocios: [a] } = await crearEscenarioPortal(db, reloj);
      const titular = 'c'.repeat(64);
      const sesion = await db.query(`INSERT INTO sesiones_reserva_publica
        (negocio_id,titular_hash,generacion) VALUES (?,?,1)`, [a.id, titular]);
      const sesionId = Number(sesion.insertId);
      const apartadoId = a.ocupaciones[1];
      await db.query(`UPDATE bloqueos_temporales SET sesion_id=?,generacion=1,
        titular_hash=?,costo_aceptado='100.00',zona_horaria_apartado='America/Chihuahua'
        WHERE id=?`, [sesionId, titular, apartadoId]);
      await db.query('UPDATE sesiones_reserva_publica SET apartado_actual_id=? WHERE id=?',
        [apartadoId, sesionId]);
      const coordinacion = new CoordinacionReservaPublicaService(db, reloj);
      const intentos = new IntentosReservaPublicaService(db, coordinacion, reloj);
      const clave = 'intento_registrado_123';
      const intento = await intentos.preparar(a.id, titular, { clave, apartadoId });
      const citaId = a.ocupaciones[0];
      await db.query(`UPDATE citas SET costo_aceptado='100.00',nombre_negocio='Portal 1',
        nombre_servicio='Corte',nombre_sucursal='Sucursal 1-0',
        nombre_profesional='Profesional 1-1' WHERE id=?`, [citaId]);
      const contacto = { nombre: 'Ana', telefono: '6141234567', notas: null };
      process.env.PORTAL_FORMULARIO_HMAC_SECRET = 'secreto-aislado-de-pruebas-1234567890';
      const { huellaContactoReservaPublica } = await import('../src/reservas-publicas/contacto-reserva-publica');
      await db.query(`UPDATE intentos_reserva_publica SET estado='registrado',
        formulario_hash=?,cita_id=? WHERE id=?`,
      [huellaContactoReservaPublica(contacto), citaId, intento.id]);
      reloj.fijar(new Date('2026-10-20T12:10:00Z'));
      expect(await intentos.reconocerResultado(a.id, titular, clave, contacto))
        .toMatchObject({ folio: 'P-1', estado: 'pendiente', costoAceptado: '100.00' });
      await expect(intentos.reconocerResultado(a.id, titular, clave,
        { ...contacto, nombre: 'Otra' })).rejects.toThrow();
      await expect(intentos.reconocerResultado(a.id, 'd'.repeat(64), clave, contacto))
        .rejects.toThrow();
      await db.query(`UPDATE intentos_reserva_publica SET estado='no_registrado',
        cita_id=NULL WHERE id=?`, [intento.id]);
      await expect(intentos.reconocerResultado(a.id, titular, clave, contacto))
        .rejects.toThrow();
      await expect(intentos.preparar(a.id, titular, { clave, apartadoId }))
        .rejects.toThrow();
      delete process.env.PORTAL_FORMULARIO_HMAC_SECRET;
    });
  }, 120000);
});
