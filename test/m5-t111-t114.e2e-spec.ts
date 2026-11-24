import { performance } from 'node:perf_hooks';
import request from 'supertest';
import { QueryFailedError, SelectQueryBuilder } from 'typeorm';
import { Rol } from '../src/auth/enums/rol.enum';
import { EjecucionPeriodicaService } from '../src/operacion/ejecucion-periodica.service';
import { situarSesion } from './support/acceso-operativo';
import { conAgendaHttp } from './support/agenda-http';

const RUTA = '/reportes/cortes';
const PERIODO = { desde: '2026-08-01', hasta: '2026-10-15', agrupacion: 'mes' };
type Escenario = Parameters<Parameters<typeof conAgendaHttp>[0]>[0];

function api(f: Escenario, actor = f.actor(Rol.ADMIN_NEGOCIO).id) {
  const token = `Bearer ${f.token(actor)}`;
  return {
    crear: () => request(f.http).post(RUTA).set('Authorization', token).send(PERIODO),
    resumen: (id: string) => request(f.http).get(`${RUTA}/${id}`).set('Authorization', token),
    filas: (id: string, query = '') => request(f.http).get(`${RUTA}/${id}/filas${query}`).set('Authorization', token),
  };
}

async function sembrar(f: Escenario, cantidad: number, intervalo = 0) {
  const propio = f.negocios[0];
  // Son citas sintéticas en una base desechable. Repetir el inicio prueba el desempate por ID.
  await f.db.query(`INSERT INTO citas (
    negocio_id,sucursal_id,personal_id,servicio_id,cliente_id,inicio_utc,fin_utc,
    zona_horaria_reserva,folio,estado,origen,costo_aceptado,nombre_servicio,nombre_sucursal,
    nombre_profesional,nombre_contacto,telefono_contacto,motivo_consulta)
    SELECT c.negocio_id,IF(MOD(s.seq,2)=0,?,c.sucursal_id),c.personal_id,
      IF(MOD(s.seq,3)=0,?,c.servicio_id),c.cliente_id,
      TIMESTAMPADD(MINUTE,s.seq*?,'2026-08-01 04:00:00'),
      TIMESTAMPADD(MINUTE,s.seq*?+15,'2026-08-01 04:00:00'),
      'America/New_York',CONCAT('RPT-',s.seq),
      IF(MOD(s.seq,5)=0,'cancelada','completada'),IF(MOD(s.seq,2)=0,'manual','portal_publico'),
      25.40,'Servicio histórico','Sede histórica','Profesional histórico','Contacto privado','6145550100','Nota privada'
    FROM citas c CROSS JOIN seq_1_to_2507 s WHERE c.id=? AND s.seq<=?`,
  [propio.sucursales[1].id, propio.servicioInactivoId, intervalo, intervalo, propio.ocupaciones[0], cantidad]);
  const filas: { id: number }[] = await f.db.query("SELECT id FROM citas WHERE folio LIKE 'RPT-%' ORDER BY id");
  return filas.map(({ id }) => id);
}

describe('M5-T111–T114 · HTTP de cortes de reportes', () => {
  it('entrega resumen y páginas privadas, estables y limitadas al titular', async () => {
    await conAgendaHttp(async (f) => {
      const ids = await sembrar(f, 3);
      const propio = api(f);
      const { body: corte } = await propio.crear().expect(201);
      for (const sufijo of ['', '/filas']) {
        await request(f.http).get(`${RUTA}/${corte.id}${sufijo}`).expect(401);
      }
      for (const rol of [Rol.RECEPCIONISTA, Rol.PROFESIONAL, Rol.SUPERADMIN]) {
        const otroRol = api(f, rol === Rol.SUPERADMIN ? f.superadmin.id : f.actor(rol).id);
        await otroRol.resumen(corte.id).expect(403);
        await otroRol.filas(corte.id).expect(403);
      }
      const ajeno = api(f, f.actor(Rol.ADMIN_NEGOCIO, 1).id);
      await ajeno.resumen(corte.id).expect(404);
      await ajeno.filas(corte.id).expect(404);
      await propio.resumen('desconocido').expect(404);
      await propio.filas('desconocido').expect(404);

      const resumen = await propio.resumen(corte.id).expect('Cache-Control', 'no-store').expect(200);
      expect(resumen.body).toMatchObject({ ...corte, totalCitas: 3, estados: { completada: 3 } });
      const pagina = await propio.filas(corte.id).expect('Cache-Control', 'no-store').expect(200);
      expect(pagina.body).toMatchObject({ ...corte, pagina: 1, limite: 100, total: 3, hayMas: false });
      expect(pagina.body.filas.map((fila: { citaId: number }) => fila.citaId)).toEqual(ids);
      expect(pagina.body.filas[0]).toMatchObject({ fechaCivil: '2026-08-01',
        inicioUtc: '2026-08-01T04:00:00.000Z', costoAceptado: '25.40', nombreServicio: 'Servicio histórico' });
      expect(pagina.text).not.toMatch(/Contacto privado|6145550100|Nota privada|actorUsuarioId/);
      const segunda = await propio.filas(corte.id, '?pagina=2&limite=2').expect(200);
      expect(segunda.body).toMatchObject({ ...corte, pagina: 2, limite: 2, total: 3, hayMas: false,
        filas: [expect.objectContaining({ citaId: ids[2] })] });
      const fuera = await propio.filas(corte.id, '?pagina=3&limite=2').expect(200);
      expect(fuera.body).toMatchObject({ ...corte, total: 3, filas: [], hayMas: false });
      for (const query of ['?pagina=0', '?pagina=1.5', '?pagina=4294967296', '?limite=0',
        '?limite=501', '?limite=1&limite=2', '?servicioId=1']) {
        await propio.filas(corte.id, query).expect(400);
      }

      // El cambio de administrador conserva el negocio y deja el corte ligado a su titular original.
      const reemplazo = f.actor(Rol.RECEPCIONISTA);
      await f.segunda.transaction(async (manager) => {
        await manager.query("UPDATE usuarios SET rol='recepcionista' WHERE id=?", [f.actor(Rol.ADMIN_NEGOCIO).id]);
        await manager.query("UPDATE usuarios SET rol='admin_negocio' WHERE id=?", [reemplazo.id]);
      });
      await propio.resumen(corte.id).expect(403);
      await propio.filas(corte.id).expect(403);
      await api(f, reemplazo.id).resumen(corte.id).expect(404);
      await api(f, reemplazo.id).filas(corte.id).expect(404);
    });
  });

  it('vence al límite exacto y el ciclo elimina solo los cortes vencidos con sus filas', async () => {
    await conAgendaHttp(async (f) => {
      const ids = await sembrar(f, 1);
      const propio = api(f);
      const { body: viejo } = await propio.crear().expect(201);
      f.reloj.avanzar(60_000);
      const { body: vigente } = await propio.crear().expect(201);
      const expira = new Date(viejo.expiraEn);
      await situarSesion(f.db, f.actor(Rol.ADMIN_NEGOCIO), expira);
      f.reloj.fijar(new Date(expira.getTime() - 1));
      await propio.resumen(viejo.id).expect(200);
      await propio.filas(viejo.id).expect(200);

      f.reloj.fijar(expira);
      await propio.resumen(viejo.id).expect(404);
      await propio.filas(viejo.id).expect(404);
      // El rechazo se verifica antes de la limpieza física y esta debe poder repetirse.
      expect(await f.db.query('SELECT id FROM cortes_reporte WHERE id=?', [viejo.id])).toHaveLength(1);
      const ciclo = f.app.get(EjecucionPeriodicaService);
      await ciclo.ciclo();
      await ciclo.ciclo();
      expect(await f.db.query('SELECT id FROM cortes_reporte')).toEqual([{ id: vigente.id }]);
      expect(await f.db.query('SELECT corte_id, cita_id FROM filas_corte_reporte'))
        .toEqual([{ corte_id: vigente.id, cita_id: ids[0] }]);
      expect(await f.db.query('SELECT id FROM citas WHERE id=?', ids)).toEqual([{ id: ids[0] }]);
      await propio.resumen(vigente.id).expect(200);
      await propio.filas(vigente.id).expect(200);
    });
  });

  it('concilia 2.507 filas y devuelve errores completos ante fallos de lectura', async () => {
    await conAgendaHttp(async (f) => {
      const ids = await sembrar(f, 2507, 37);
      const propio = api(f);
      const comienzo = performance.now();
      const { body: corte } = await propio.crear().expect(201);
      const materializado = performance.now();
      const { body: resumen } = await propio.resumen(corte.id).expect(200);
      const resumido = performance.now();
      expect(resumen.totalCitas).toBe(2507);
      expect(resumen.estados).toMatchObject({ completada: 2006, cancelada: 501 });

      const idsLeidos: number[] = [];
      for (let pagina = 1; pagina <= 6; pagina += 1) {
        const { body } = await propio.filas(corte.id, `?pagina=${pagina}&limite=500`).expect(200);
        expect(body).toMatchObject({ id: corte.id, pagina, limite: 500, total: 2507, hayMas: pagina < 6 });
        expect(body.filas).toHaveLength(pagina < 6 ? 500 : 7);
        idsLeidos.push(...body.filas.map((fila: { citaId: number }) => fila.citaId));
      }
      const paginado = performance.now();
      expect(idsLeidos).toEqual(ids);
      expect(new Set(idsLeidos).size).toBe(resumen.totalCitas);
      const plan: { key: string | null }[] = await f.db.query(`EXPLAIN SELECT cita_id, fecha_civil, inicio_utc
        FROM filas_corte_reporte WHERE corte_id=? ORDER BY fecha_civil,inicio_utc,cita_id LIMIT 500 OFFSET 500`, [corte.id]);
      console.info(`M5-T113 · 2507 filas · crear ${(materializado - comienzo).toFixed(1)} ms · resumen ${(resumido - materializado).toFixed(1)} ms · 6 páginas ${(paginado - resumido).toFixed(1)} ms · índice ${plan[0].key}`);

      const consultar = SelectQueryBuilder.prototype.getRawMany;
      let leidas = 0;
      let temporal = true;
      // Inyecta el error después de un lote real del resumen y luego al pedir una página intermedia.
      const fallo = jest.spyOn(SelectQueryBuilder.prototype, 'getRawMany').mockImplementation(async function (
        this: SelectQueryBuilder<never>,
      ) {
        if (this.alias === 'fila' && ++leidas > 1) {
          throw new QueryFailedError('SELECT detalle_sql_privado', [],
            Object.assign(new Error('detalle_sql_privado'), { code: temporal ? 'ER_LOCK_WAIT_TIMEOUT' : 'ER_PARSE_ERROR' }));
        }
        return consultar.call(this);
      });
      try {
        const sinResumen = await propio.resumen(corte.id).expect(503);
        expect(leidas).toBe(2);
        expect(sinResumen.body.message).toMatch(/acot/i);
        expect(sinResumen.body).not.toHaveProperty('totalCitas');
        expect(sinResumen.text).not.toContain('detalle_sql_privado');
        temporal = false;
        const sinPagina = await propio.filas(corte.id, '?pagina=2&limite=500').expect(500);
        expect(sinPagina.body).not.toHaveProperty('filas');
        expect(sinPagina.body).not.toHaveProperty('total');
        expect(sinPagina.text).not.toContain('detalle_sql_privado');
      } finally { fallo.mockRestore(); }
      await propio.filas(corte.id, '?pagina=2&limite=500').expect(200);
    });
  });

  it('mantiene los importes, estados, nombres y orden del corte cuando otra conexión edita entre páginas', async () => {
    await conAgendaHttp(async (f) => {
      const [primeraId, segundaId] = await sembrar(f, 2);
      const propio = api(f);
      const { body: corte } = await propio.crear().expect(201);
      const { body: resumen } = await propio.resumen(corte.id).expect(200);
      const { body: primera } = await propio.filas(corte.id, '?limite=1').expect(200);
      expect(primera.filas[0].citaId).toBe(primeraId);

      // La segunda conexión cambia una fila aún no leída y los catálogos tras entregar la primera página.
      await f.segunda.transaction(async (manager) => {
        await manager.query(`UPDATE citas SET estado='cancelada',costo_aceptado=99.95,
          nombre_servicio='Servicio actualizado',nombre_sucursal='Sede actualizada',
          inicio_utc='2026-08-02 05:00:00',fin_utc='2026-08-02 05:15:00' WHERE id=?`, [segundaId]);
        await manager.query(`UPDATE servicios SET nombre='Catálogo actualizado',costo=500
          WHERE id=(SELECT servicio_id FROM citas WHERE id=?)`, [segundaId]);
        await manager.query(`UPDATE sucursales SET nombre='Sede actual'
          WHERE id=(SELECT sucursal_id FROM citas WHERE id=?)`, [segundaId]);
      });
      const { body: segunda } = await propio.filas(corte.id, '?pagina=2&limite=1').expect(200);
      expect(segunda).toMatchObject({ ...corte, total: 2, hayMas: false, filas: [{
        citaId: segundaId, estado: 'completada', costoAceptado: '25.40',
        nombreServicio: 'Servicio histórico', nombreSucursal: 'Sede histórica', fechaCivil: '2026-08-01',
      }] });
      await propio.filas(corte.id, '?limite=1').expect(200, primera);
      await propio.resumen(corte.id).expect(200, resumen);
      expect(resumen.ingresosEstimados.subtotalConocido).toBe('50.80');

      const { body: nuevo } = await propio.crear().expect(201);
      const respuesta = await propio.resumen(nuevo.id).expect(200);
      expect(respuesta.body).toMatchObject({ totalCitas: 2, estados: { completada: 1, cancelada: 1 },
        ingresosEstimados: { subtotalConocido: '25.40' } });
    });
  });
});
