import request from 'supertest';
import { EntityManager } from 'typeorm';
import { Rol } from '../src/auth/enums/rol.enum';
import { CortesReporteService } from '../src/reportes/cortes-reporte.service';
import { conAgendaHttp } from './support/agenda-http';

const RUTA = '/reportes/cortes';
const PERIODO = { desde: '2026-11-10', hasta: '2026-11-10', agrupacion: 'semana' };
type Escenario = Parameters<Parameters<typeof conAgendaHttp>[0]>[0];

function crear(f: Escenario, id = f.actor(Rol.ADMIN_NEGOCIO).id) {
  return request(f.http).post(RUTA).set('Authorization', `Bearer ${f.token(id)}`);
}

async function prepararCita(f: Escenario, indice = 0) {
  const id = f.negocios[indice].ocupaciones[0];
  // El inicio UTC cae al día siguiente, pero la cita pertenece al día civil del filtro.
  await f.db.query(`UPDATE citas SET inicio_utc='2026-11-11 04:00:00',
    fin_utc='2026-11-11 04:30:00', fin_ocupacion_utc=NULL, zona_horaria_reserva='America/Chihuahua',
    estado='cancelada', causa_cancelacion='falta_confirmacion_plazo', costo_aceptado=125.35,
    nombre_servicio='Servicio histórico', nombre_sucursal='Sucursal histórica',
    nombre_profesional='Profesional histórico' WHERE id=?`, [id]);
  return id;
}

describe('M5-T103–T105 · cortes de reportes', () => {
  it('reserva la creación a Administración y valida fechas, agrupación y pertenencia de cada filtro', async () => {
    await conAgendaHttp(async (f) => {
      await request(f.http).post(RUTA).send(PERIODO).expect(401);
      for (const id of [f.superadmin.id, f.actor(Rol.PROFESIONAL).id, f.actor(Rol.RECEPCIONISTA).id]) {
        await crear(f, id).send(PERIODO).expect(403);
      }
      for (const cambios of [{ desde: '2026-02-30' }, { hasta: '2026-11-09' },
        { agrupacion: 'dia' }, { personalId: 0 }, { servicioId: '1' }, { sucursalId: 2 ** 32 },
        { negocioId: f.negocios[1].id }, { actorUsuarioId: f.actor(Rol.ADMIN_NEGOCIO, 1).id }]) {
        await crear(f).send({ ...PERIODO, ...cambios }).expect(400);
      }
      const otro = f.negocios[1];
      for (const filtro of [{ sucursalId: otro.sucursales[0].id },
        { personalId: otro.profesionales[0] }, { servicioId: otro.servicioInactivoId }, { servicioId: 999999 }]) {
        await crear(f).send({ ...PERIODO, ...filtro }).expect(404);
      }
      expect(await f.db.query('SELECT id FROM cortes_reporte')).toEqual([]);

      // Un filtro propio inactivo sigue siendo válido para un reporte histórico vacío.
      const servicioId = f.negocios[0].servicioInactivoId;
      const respuesta = await crear(f).send({ ...PERIODO, agrupacion: 'mes', servicioId }).expect(201);
      expect(respuesta.body.filtros).toEqual({ ...PERIODO, agrupacion: 'mes',
        servicioId, sucursalId: null, personalId: null });
      expect(await f.db.query('SELECT cita_id FROM filas_corte_reporte')).toEqual([]);
    });
  });

  it('publica solo datos históricos mínimos e impide modificar las filas del corte', async () => {
    await conAgendaHttp(async (f) => {
      const citaId = await prepararCita(f);
      const propio = f.negocios[0];
      const [{ servicio_id: servicioId }] = await f.db.query('SELECT servicio_id FROM citas WHERE id=?', [citaId]);
      const filtros = { ...PERIODO, sucursalId: propio.sucursales[0].id,
        personalId: propio.profesionales[0], servicioId };
      await f.db.query("UPDATE sucursales SET zona_horaria='UTC' WHERE id=?", [filtros.sucursalId]);
      const respuesta = await crear(f).send(filtros).expect('Cache-Control', 'no-store').expect(201);
      const ahora = f.reloj.ahora();
      expect(respuesta.body).toEqual({ id: expect.stringMatching(/^[0-9a-f-]{36}$/), filtros,
        fechaCorte: ahora.toISOString(), expiraEn: new Date(ahora.getTime() + 86_400_000).toISOString() });
      const { id } = respuesta.body;
      expect(await f.db.query('SELECT negocio_id,actor_usuario_id,completo FROM cortes_reporte WHERE id=?', [id]))
        .toEqual([{ negocio_id: propio.id, actor_usuario_id: f.actor(Rol.ADMIN_NEGOCIO).id, completo: 1 }]);
      const leer = () => f.db.query('SELECT * FROM filas_corte_reporte WHERE corte_id=?', [id]);
      const filas = await leer();
      expect(filas).toEqual([{
        corte_id: id, cita_id: citaId, sucursal_id: filtros.sucursalId, personal_id: filtros.personalId,
        servicio_id: filtros.servicioId, nombre_sucursal: 'Sucursal histórica',
        nombre_profesional: 'Profesional histórico', nombre_servicio: 'Servicio histórico',
        fecha_civil: expect.anything(), inicio_utc: new Date('2026-11-11T04:00:00Z'),
        fin_utc: new Date('2026-11-11T04:30:00Z'), estado: 'cancelada', origen: 'manual',
        costo_aceptado: '125.35', causa_cancelacion: 'falta_confirmacion_plazo',
      }]);
      expect(await f.db.query('SELECT CAST(fecha_civil AS CHAR) fecha FROM filas_corte_reporte'))
        .toEqual([{ fecha: PERIODO.desde }]);
      await expect(f.db.query("UPDATE filas_corte_reporte SET estado='confirmada' WHERE corte_id=?", [id]))
        .rejects.toThrow(/inmutable/i);
      await expect(f.db.query('DELETE FROM filas_corte_reporte WHERE corte_id=?', [id])).rejects.toThrow(/inmutable/i);
      await f.db.query("UPDATE citas SET nombre_servicio='Renombrado', estado='confirmada', causa_cancelacion=NULL WHERE id=?", [citaId]);
      expect(await leer()).toEqual(filas);
    });
  });

  it('conserva la fotografía tras un commit concurrente y publica cabecera y filas juntas', async () => {
    await conAgendaHttp(async (f) => {
      const citaId = await prepararCita(f);
      await prepararCita(f, 1);
      const insertar = EntityManager.prototype.insert;
      let observada = false;
      const espia = jest.spyOn(EntityManager.prototype, 'insert').mockImplementation(async function (
        this: EntityManager, ...args: Parameters<EntityManager['insert']>
      ) {
        const resultado = await insertar.apply(this, args);
        if (this.connection.getMetadata(args[0]).tableName === 'cortes_reporte') {
          observada = true;
          // La otra conexión ve cero cortes y confirma un cambio antes de leer las citas del corte.
          expect(await f.segunda.query('SELECT id FROM cortes_reporte')).toEqual([]);
          expect(await f.segunda.query('SELECT cita_id FROM filas_corte_reporte')).toEqual([]);
          await f.segunda.query("UPDATE citas SET estado='confirmada', causa_cancelacion=NULL WHERE id=?", [citaId]);
        }
        return resultado;
      });
      try {
        const respuesta = await crear(f).send(PERIODO).expect(201);
        expect(observada).toBe(true);
        expect(await f.segunda.query('SELECT completo FROM cortes_reporte WHERE id=?', [respuesta.body.id]))
          .toEqual([{ completo: 1 }]);
        expect(await f.segunda.query('SELECT estado FROM filas_corte_reporte WHERE corte_id=?', [respuesta.body.id]))
          .toEqual([{ estado: 'cancelada' }]);
        expect(await f.segunda.query('SELECT estado FROM citas WHERE id=?', [citaId])).toEqual([{ estado: 'confirmada' }]);
      } finally { espia.mockRestore(); }
    });
  });

  it('revierte la cabecera y sus filas si falla después de insertar datos del corte', async () => {
    await conAgendaHttp(async (f) => {
      await prepararCita(f);
      // La fila ya existe en la transacción. Este fallo impide marcar el corte completo.
      await f.db.query(`CREATE TRIGGER prueba_fallo_corte BEFORE UPDATE ON cortes_reporte
        FOR EACH ROW SIGNAL SQLSTATE '45000' SET MYSQL_ERRNO=1205, MESSAGE_TEXT='Fallo SQL de prueba'`);
      const respuesta = await crear(f).send(PERIODO).expect(503);
      expect(respuesta.text).not.toContain('Fallo SQL de prueba');
      expect(await f.segunda.query('SELECT id FROM cortes_reporte')).toEqual([]);
      expect(await f.segunda.query('SELECT cita_id FROM filas_corte_reporte')).toEqual([]);
    });
  });

  it('solo permite recuperar un corte completo, propio y sin vencer desde el servicio', async () => {
    await conAgendaHttp(async (f) => {
      const titular = f.actor(Rol.ADMIN_NEGOCIO).id;
      const servicio = f.app.get(CortesReporteService);
      const respuesta = await crear(f).send(PERIODO).expect(201);
      const { id } = respuesta.body;
      await expect(servicio.obtenerCorte(f.actor(Rol.ADMIN_NEGOCIO, 1).id, id))
        .rejects.toMatchObject({ status: 404 });
      await expect(servicio.obtenerCorte(f.actor(Rol.RECEPCIONISTA).id, id))
        .rejects.toMatchObject({ status: 403 });
      await expect(servicio.obtenerCorte(titular, 'corte-invalido')).rejects.toMatchObject({ status: 404 });

      // El reloj alcanza el límite exacto sin depender de la expiración de la sesión HTTP.
      f.reloj.avanzar(86_400_000 - 1);
      await expect(servicio.obtenerCorte(titular, id)).resolves.toMatchObject({ id, completo: true });
      f.reloj.avanzar(1);
      await expect(servicio.obtenerCorte(titular, id)).rejects.toMatchObject({ status: 404 });
    });
  });
});
