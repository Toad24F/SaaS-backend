import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { RELOJ } from '../src/comun/reloj';
import { MotorDisponibilidadService } from '../src/disponibilidad/motor-disponibilidad.service';
import { ApartadosService } from '../src/reservas-publicas/apartados.service';
import { conBaseMigrada } from './support/mariadb';
import { crearEscenarioPortal } from './support/escenario-portal';
import { RelojPrueba } from './support/reloj';

const AHORA = new Date('2026-10-20T12:00:00Z');

/** Una base migrada comprueba commits, propiedad y reloj sin dobles de repositorio. */
describe('M3-T058–T062: apartado y reemplazo durable', () => {
  it('concede, repite sin renovar y libera solo el apartado propio exacto', async () => {
    await conBaseMigrada(async (db) => {
      const reloj = new RelojPrueba(AHORA);
      const { negocios: [a, b] } = await crearEscenarioPortal(db, reloj);
      for (const negocio of [a, b]) await db.query(`INSERT INTO licencias
        (negocio_id,creado_en,habilitada_en,vence_en)
        VALUES (?,'2026-01-01','2026-01-01','2027-01-01')`, [negocio.id]);
      await db.query(`INSERT INTO horarios_personal (negocio_id,personal_id,sucursal_id,
        dia_semana,orden,inicio_minutos,fin_minutos,activo)
        VALUES (?,?,?,2,0,480,720,1)`, [a.id, a.profesionales[0], a.sucursales[0].id]);
      const servicioId = Number((await db.query('SELECT id FROM servicios WHERE negocio_id=? AND activo=1',
        [a.id]))[0].id);
      const titular = 'a'.repeat(64);
      await db.query(`INSERT INTO sesiones_reserva_publica
        (negocio_id,titular_hash,generacion) VALUES (?,?,0)`, [a.id, titular]);
      const modulo = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(DataSource).useValue(db).overrideProvider(RELOJ).useValue(reloj).compile();
      const app = modulo.createNestApplication();
      try {
        await app.init();
        const servicio = app.get(ApartadosService);
        const seleccion = { personalId: a.profesionales[0], sucursalId: a.sucursales[0].id,
          servicioId, fechaLocal: '2026-10-20', horaInicio: '08:00' };
        await expect(servicio.solicitar(a.id, titular, { ...seleccion,
          personalId: b.profesionales[0], clave: 'apartado_ajeno_123' }))
          .rejects.toMatchObject({ status: 404 });
        expect((await db.query('SELECT generacion FROM sesiones_reserva_publica WHERE negocio_id=?',
          [a.id]))[0].generacion).toBe('0');
        const primero = await servicio.solicitar(a.id, titular,
          { ...seleccion, clave: 'apartado_1234567890' });
        expect(primero).toMatchObject({ estado: 'concedida', generacion: '1',
          costoAceptado: '100.00', zonaHoraria: a.sucursales[0].zona });
        expect(primero.expiraEn).toEqual(new Date(AHORA.getTime() + 300_000));
        reloj.fijar(new Date(AHORA.getTime() + 60_000));
        expect(await servicio.solicitar(a.id, titular,
          { ...seleccion, clave: 'apartado_1234567890' })).toEqual(primero);
        await expect(servicio.solicitar(a.id, titular,
          { ...seleccion, horaInicio: '09:00', clave: 'apartado_1234567890' }))
          .rejects.toMatchObject({ status: 409 });
        await expect(servicio.liberar(b.id, titular, primero.apartadoId!, '1'))
          .rejects.toMatchObject({ status: 404 });
        await expect(servicio.liberar(a.id, 'b'.repeat(64), primero.apartadoId!, '1'))
          .rejects.toMatchObject({ status: 404 });
        await servicio.liberar(a.id, titular, primero.apartadoId!, '1');
        await servicio.liberar(a.id, titular, primero.apartadoId!, '1');
        const filas = await db.query(`SELECT liberado_en,expira_en FROM bloqueos_temporales
          WHERE id=?`, [primero.apartadoId]);
        expect(filas[0].liberado_en).not.toBeNull();
        expect(new Date(filas[0].expira_en)).toEqual(primero.expiraEn);
        const segundo = await servicio.solicitar(a.id, titular,
          { ...seleccion, horaInicio: '09:00', clave: 'apartado_2345678901' });
        expect(segundo).toMatchObject({ estado: 'concedida', generacion: '2' });
        await servicio.liberar(a.id, titular, primero.apartadoId!, '1');
        expect((await db.query('SELECT liberado_en FROM bloqueos_temporales WHERE id=?',
          [segundo.apartadoId]))[0].liberado_en).toBeNull();
        const rechazada = await servicio.solicitar(a.id, titular,
          { ...seleccion, horaInicio: '17:00', clave: 'apartado_3456789012' });
        expect(rechazada).toMatchObject({ estado: 'rechazada', generacion: '3', apartadoId: null });
        expect(await servicio.solicitar(a.id, titular,
          { ...seleccion, horaInicio: '17:00', clave: 'apartado_3456789012' }))
          .toEqual(rechazada);
        expect((await db.query('SELECT liberado_en FROM bloqueos_temporales WHERE id=?',
          [segundo.apartadoId]))[0].liberado_en).not.toBeNull();
        const motor = app.get(MotorDisponibilidadService);
        const interrupcion = jest.spyOn(motor, 'revalidarPublicoEnTransaccion')
          .mockRejectedValueOnce(new Error('Interrupción entre commits'));
        await expect(servicio.solicitar(a.id, titular,
          { ...seleccion, horaInicio: '08:30', clave: 'apartado_4567890123' }))
          .rejects.toThrow('Interrupción entre commits');
        interrupcion.mockRestore();
        expect((await db.query(`SELECT estado,generacion FROM operaciones_apartado
          WHERE negocio_id=? AND clave=?`, [a.id, 'apartado_4567890123']))[0])
          .toMatchObject({ estado: 'preparada', generacion: '4' });
        const retomada = await servicio.solicitar(a.id, titular,
          { ...seleccion, horaInicio: '08:30', clave: 'apartado_4567890123' });
        expect(retomada).toMatchObject({ estado: 'concedida', generacion: '4' });
        const otraInterrupcion = jest.spyOn(motor, 'revalidarPublicoEnTransaccion')
          .mockRejectedValueOnce(new Error('Fallo de pestaña'));
        await expect(servicio.solicitar(a.id, titular,
          { ...seleccion, horaInicio: '08:45', clave: 'apartado_5678901234' }))
          .rejects.toThrow('Fallo de pestaña');
        otraInterrupcion.mockRestore();
        // La primera fase ya confirmó la liberación pese al rollback de la segunda.
        expect((await db.query('SELECT liberado_en FROM bloqueos_temporales WHERE id=?',
          [retomada.apartadoId]))[0].liberado_en).not.toBeNull();
        expect((await db.query('SELECT generacion,apartado_actual_id FROM sesiones_reserva_publica WHERE negocio_id=?',
          [a.id]))[0]).toMatchObject({ generacion: '5', apartado_actual_id: null });
        const actual = await servicio.solicitar(a.id, titular,
          { ...seleccion, horaInicio: '09:15', clave: 'apartado_6789012345' });
        expect(actual).toMatchObject({ estado: 'concedida', generacion: '6' });
        expect(await servicio.solicitar(a.id, titular,
          { ...seleccion, horaInicio: '08:45', clave: 'apartado_5678901234' }))
          .toMatchObject({ estado: 'sustituida', generacion: '5', apartadoId: null });
        expect((await db.query('SELECT apartado_actual_id,generacion FROM sesiones_reserva_publica WHERE negocio_id=?',
          [a.id]))[0]).toMatchObject({ apartado_actual_id: actual.apartadoId,
          generacion: '6' });
        const sesionId = Number((await db.query('SELECT id FROM sesiones_reserva_publica WHERE negocio_id=?',
          [a.id]))[0].id);
        await db.query(`INSERT INTO intentos_reserva_publica
          (negocio_id,sesion_id,clave,apartado_id,estado,cita_id)
          VALUES (?,?,?,?,'registrado',?)`, [a.id, sesionId,
          'intento_registrado_1', actual.apartadoId, a.ocupaciones[0]]);
        await servicio.liberar(a.id, titular, actual.apartadoId!, '6');
        expect((await db.query('SELECT liberado_en FROM bloqueos_temporales WHERE id=?',
          [actual.apartadoId]))[0].liberado_en).toBeNull();
        await expect(servicio.solicitar(a.id, titular,
          { ...seleccion, horaInicio: '10:00', clave: 'apartado_7890123456' }))
          .rejects.toMatchObject({ status: 409 });
        expect((await db.query('SELECT generacion FROM sesiones_reserva_publica WHERE id=?',
          [sesionId]))[0].generacion).toBe('6');
      } finally { await app.close(); }
    });
  }, 120000);
});
