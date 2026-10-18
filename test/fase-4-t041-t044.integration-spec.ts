import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { RELOJ } from '../src/comun/reloj';
import { MotorDisponibilidadService } from '../src/disponibilidad/motor-disponibilidad.service';
import { CatalogoPublicoService } from '../src/reservas-publicas/catalogo-publico.service';
import { conBaseMigrada } from './support/mariadb';
import { crearEscenarioPortal } from './support/escenario-portal';
import { RelojPrueba } from './support/reloj';

const AHORA = new Date('2026-10-20T12:00:00Z');
type NegocioPrueba = Awaited<ReturnType<typeof crearEscenarioPortal>>['negocios'][number];

/** Cada caso usa una base migrada desechable y un reloj inyectado en HTTP y motor. */
async function conPortal(ejecutar: (f: { db: DataSource; app: INestApplication;
  reloj: RelojPrueba; a: NegocioPrueba; b: NegocioPrueba; servicioId: number;
  catalogo: string; disponibilidad: string; consulta: Record<string, string | number>;
}) => Promise<void>) {
  await conBaseMigrada(async (db) => {
    const reloj = new RelojPrueba(AHORA);
    const { negocios: [a, b] } = await crearEscenarioPortal(db, reloj);
    for (const negocio of [a, b]) await db.query(`INSERT INTO licencias
      (negocio_id,creado_en,habilitada_en,vence_en)
      VALUES (?,'2026-01-01','2026-01-01','2027-01-01')`, [negocio.id]);
    const servicioId = Number((await db.query(`SELECT id FROM servicios
      WHERE negocio_id=? AND activo=1`, [a.id]))[0].id);
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DataSource).useValue(db)
      .overrideProvider(RELOJ).useValue(reloj).compile();
    const app = modulo.createNestApplication();
    try {
      await app.init();
      const raiz = '/publico/negocios/portal-prueba-1';
      await ejecutar({ db, app, reloj, a, b, servicioId,
        catalogo: `${raiz}/catalogo`, disponibilidad: `${raiz}/disponibilidad`,
        consulta: { personalId: a.profesionales[0], sucursalId: a.sucursales[0].id,
          servicioId, desde: '2026-10-20', hasta: '2026-10-20' } });
    } finally { await app.close(); }
  });
}

describe('M3-T041–T044: selección, errores y agenda pública', () => {
  it('oculta cada nivel apagado y actualiza opciones al cambiar servicio y sucursal', async () => {
    await conPortal(async ({ db, app, a, b, servicioId, catalogo, disponibilidad, consulta }) => {
      const http = app.getHttpServer();
      const leer = async () => (await request(http).get(catalogo).expect(200)).body;
      const activo = async () => expect((await leer()).servicios.map((s: { id: number }) => s.id))
        .toContain(servicioId);
      await activo();
      // Cada interruptor por sí solo invalida la combinación original.
      const cambios: Array<[string, string, unknown[]]> = [
        ['servicios', 'id=? AND negocio_id=?', [servicioId, a.id]],
        ['sucursales', 'id=? AND negocio_id=?', [a.sucursales[0].id, a.id]],
        ['usuarios', 'id=? AND negocio_id=?', [a.profesionales[0], a.id]],
        ['personal_sucursales', 'negocio_id=? AND personal_id=? AND sucursal_id=?',
          [a.id, a.profesionales[0], a.sucursales[0].id]],
        ['personal_servicios', 'negocio_id=? AND personal_id=? AND servicio_id=?',
          [a.id, a.profesionales[0], servicioId]],
        ['personal_servicios_sucursales',
          'negocio_id=? AND personal_id=? AND sucursal_id=? AND servicio_id=?',
          [a.id, a.profesionales[0], a.sucursales[0].id, servicioId]],
      ];
      for (const [tabla, filtro, parametros] of cambios) {
        await db.query(`UPDATE ${tabla} SET activo=0 WHERE ${filtro}`, parametros);
        expect((await leer()).servicios).toEqual([]);
        expect((await request(http).get(disponibilidad).query(consulta).expect(200))
          .body.ranuras).toEqual([]);
        await db.query(`UPDATE ${tabla} SET activo=1 WHERE ${filtro}`, parametros);
        await activo();
      }
      // Una nueva combinación efectiva cambia las etapas dependientes sin
      // arrastrar opciones de la selección previa ni del otro negocio.
      await db.query('UPDATE servicios SET activo=1 WHERE id=?', [a.servicioInactivoId]);
      await db.query('UPDATE sucursales SET activo=1 WHERE id=?', [a.sucursales[1].id]);
      await db.query(`UPDATE personal_sucursales SET activo=1
        WHERE negocio_id=? AND personal_id=? AND sucursal_id=?`,
      [a.id, a.profesionales[0], a.sucursales[1].id]);
      await db.query(`INSERT INTO personal_servicios
        (negocio_id,personal_id,servicio_id,activo) VALUES (?,?,?,1)`,
      [a.id, a.profesionales[0], a.servicioInactivoId]);
      await db.query(`INSERT INTO personal_servicios_sucursales
        (negocio_id,personal_id,sucursal_id,servicio_id,activo) VALUES (?,?,?,?,1)`,
      [a.id, a.profesionales[0], a.sucursales[1].id, a.servicioInactivoId]);
      const primero = await request(http).get(catalogo).query({ servicioId }).expect(200);
      const segundo = await request(http).get(catalogo)
        .query({ servicioId: a.servicioInactivoId }).expect(200);
      expect(primero.body.sucursales.map((s: { id: number }) => s.id))
        .toEqual([a.sucursales[0].id]);
      expect(segundo.body.sucursales.map((s: { id: number }) => s.id))
        .toEqual([a.sucursales[1].id]);
      const final = await request(http).get(catalogo).query({
        servicioId: a.servicioInactivoId, sucursalId: a.sucursales[1].id }).expect(200);
      expect(final.body.profesionales.map((p: { id: number }) => p.id))
        .toEqual([a.profesionales[0]]);
      expect(JSON.stringify(final.body)).not.toMatch(/portal2@|Profesional 2|6141234567|titular_hash|correo/i);
      const ajeno = await request(http).get(catalogo).query({
        servicioId: a.servicioInactivoId, sucursalId: b.sucursales[0].id }).expect(200);
      expect(ajeno.body.profesionales).toEqual([]);
    });
  }, 60000);

  it('respeta anticipación y horizonte exactos; separa vacío, 503 y 500', async () => {
    await conPortal(async ({ db, app, a, servicioId, catalogo, disponibilidad, consulta }) => {
      const http = app.getHttpServer();
      await db.query(`INSERT INTO horarios_personal (negocio_id,personal_id,sucursal_id,
        dia_semana,orden,inicio_minutos,fin_minutos,activo)
        VALUES (?,?,?,2,0,360,540,1)`, [a.id, a.profesionales[0], a.sucursales[0].id]);
      await db.query(`INSERT INTO configuracion_agenda
        (negocio_id,modo,intervalo_minutos,anticipacion_minutos,dias_futuros)
        VALUES (?,'ventana_libre',15,15,0)`, [a.id]);
      const hoy = await request(http).get(disponibilidad).query(consulta).expect(200);
      expect(hoy.body.ranuras[0].inicioUtc).toBe('2026-10-20T12:15:00.000Z');
      const manana = await request(http).get(disponibilidad).query({ ...consulta,
        desde: '2026-10-21', hasta: '2026-10-21' }).expect(200);
      expect(manana.body.ranuras).toEqual([]);
      expect(manana.body.calculadoEn).toBe(AHORA.toISOString());
      await request(http).get(disponibilidad).query({ ...consulta,
        hasta: '2026-11-19' }).expect(200);
      await request(http).get(disponibilidad).query({ ...consulta,
        hasta: '2026-11-20' }).expect(400);
      await db.query(`UPDATE configuracion_agenda SET dias_futuros=1,
        anticipacion_minutos=0 WHERE negocio_id=?`, [a.id]);
      await db.query(`INSERT INTO horarios_personal (negocio_id,personal_id,sucursal_id,
        dia_semana,orden,inicio_minutos,fin_minutos,activo)
        VALUES (?,?,?,3,0,360,540,1)`, [a.id, a.profesionales[0], a.sucursales[0].id]);
      const ultimo = await request(http).get(disponibilidad).query({ ...consulta,
        desde: '2026-10-21', hasta: '2026-10-21' }).expect(200);
      expect(ultimo.body.ranuras.length).toBeGreaterThan(0);
      const motor = app.get(MotorDisponibilidadService);
      const temporal = jest.spyOn(motor, 'consultarPublico').mockRejectedValueOnce(
        { code: 'ER_LOCK_WAIT_TIMEOUT', sql: 'SELECT titular_hash' });
      const errorTemporal = await request(http).get(disponibilidad)
        .query(consulta).expect(503);
      expect(errorTemporal.body).toMatchObject({ codigo: 'portal_503', accion: 'reintentar' });
      expect(errorTemporal.body.ranuras).toBeUndefined();
      temporal.mockRestore();
      const catalogoServicio = app.get(CatalogoPublicoService);
      const inesperado = jest.spyOn(catalogoServicio, 'consultar')
        .mockRejectedValueOnce(new Error('SQL SELECT correo FROM clientes'));
      const errorInesperado = await request(http).get(catalogo).expect(500);
      expect(JSON.stringify(errorInesperado.body)).not.toMatch(/SQL|correo|clientes|ranuras/i);
      inesperado.mockRestore();
      await db.query('UPDATE licencias SET vence_en=? WHERE negocio_id=?', [AHORA, a.id]);
      const cerrado = await request(http).get(disponibilidad).query(consulta).expect(404);
      expect(cerrado.body).toMatchObject({ codigo: 'portal_404', accion: 'volver' });
      expect(JSON.stringify(cerrado.body)).not.toMatch(/licencia|venc/i);
      expect(servicioId).toBeGreaterThan(0);
    });
  }, 60000);

  it('mantiene extremos contiguos, continuidad, descansos y ambos modos', async () => {
    await conPortal(async ({ db, app, a, disponibilidad, consulta }) => {
      const http = app.getHttpServer();
      for (const [orden, inicio, fin] of [[0, 540, 600], [1, 600, 660]]) {
        await db.query(`INSERT INTO horarios_personal (negocio_id,personal_id,sucursal_id,
          dia_semana,orden,inicio_minutos,fin_minutos,activo)
          VALUES (?,?,?,?,?,?,?,1)`, [a.id, a.profesionales[0], a.sucursales[0].id,
          2, orden, inicio, fin]);
      }
      await db.query(`INSERT INTO configuracion_agenda
        (negocio_id,modo,intervalo_minutos,anticipacion_minutos,dias_futuros)
        VALUES (?,'ventana_libre',15,0,60)`, [a.id]);
      const leer = async () => (await request(http).get(disponibilidad).query(consulta).expect(200)).body;
      const libre = await leer();
      expect(libre.ranuras.map((r: { inicioUtc: string }) => r.inicioUtc))
        .toContain('2026-10-20T15:45:00.000Z');
      // Un apartado de 09:00 a 09:30 deja libre el extremo contiguo 09:30.
      await db.query(`INSERT INTO bloqueos_temporales (negocio_id,personal_id,
        sucursal_id,servicio_id,inicio_utc,fin_utc,expira_en,titular_hash)
        VALUES (?,?,?,?,?,?,?,?)`, [a.id, a.profesionales[0], a.sucursales[0].id,
        Number(consulta.servicioId), new Date('2026-10-20T15:00:00Z'),
        new Date('2026-10-20T15:30:00Z'), new Date('2026-10-20T18:00:00Z'),
        'f'.repeat(64)]);
      const contiguo = await leer();
      expect(contiguo.ranuras.map((r: { inicioUtc: string }) => r.inicioUtc))
        .toContain('2026-10-20T15:30:00.000Z');
      expect(contiguo.ranuras.map((r: { inicioUtc: string }) => r.inicioUtc))
        .not.toContain('2026-10-20T15:15:00.000Z');
      await db.query(`UPDATE horarios_personal SET descanso_inicio_minutos=615,
        descanso_fin_minutos=630 WHERE negocio_id=? AND dia_semana=2 AND orden=1`, [a.id]);
      const descanso = await leer();
      expect(descanso.ranuras.map((r: { inicioUtc: string }) => r.inicioUtc))
        .not.toContain('2026-10-20T16:00:00.000Z');
      expect(descanso.ranuras.map((r: { inicioUtc: string }) => r.inicioUtc))
        .toContain('2026-10-20T15:45:00.000Z');
      await db.query(`UPDATE configuracion_agenda SET modo='agenda_compacta'
        WHERE negocio_id=?`, [a.id]);
      const compacta = await leer();
      expect(compacta.reglas.modo).toBe('agenda_compacta');
      expect(compacta.ranuras.length).toBeLessThan(descanso.ranuras.length);
      expect(compacta.ranuras.length).toBeGreaterThan(0);
    });
  }, 60000);

  it('omite una recurrencia DST inexistente y rechaza una excepción explícita', async () => {
    await conPortal(async ({ db, app, reloj, a, disponibilidad, consulta }) => {
      reloj.fijar(new Date('2026-03-01T12:00:00Z'));
      await db.query('UPDATE sucursales SET zona_horaria=? WHERE negocio_id=? AND id=?',
        ['America/New_York', a.id, a.sucursales[0].id]);
      await db.query(`INSERT INTO horarios_personal (negocio_id,personal_id,sucursal_id,
        dia_semana,orden,inicio_minutos,fin_minutos,activo)
        VALUES (?,?,?,0,0,120,210,1)`, [a.id, a.profesionales[0], a.sucursales[0].id]);
      const fecha = { ...consulta, desde: '2026-03-08', hasta: '2026-03-08' };
      const omitida = await request(app.getHttpServer()).get(disponibilidad)
        .query(fecha).expect(200);
      expect(omitida.body.zonaHoraria).toBe('America/New_York');
      expect(omitida.body.ranuras).toEqual([]);
      expect(omitida.body.omisiones).toEqual([{ fechaLocal: '2026-03-08',
        motivo: expect.stringMatching(/inexistente|repetida/) }]);
      const excepcion = await db.query(`INSERT INTO excepciones_horario
        (negocio_id,personal_id,sucursal_id,fecha_local) VALUES (?,?,?,'2026-03-08')`,
      [a.id, a.profesionales[0], a.sucursales[0].id]);
      await db.query(`INSERT INTO franjas_excepcion_horario
        (negocio_id,excepcion_id,orden,inicio_minutos,fin_minutos)
        VALUES (?,?,0,120,210)`, [a.id, excepcion.insertId]);
      const invalida = await request(app.getHttpServer()).get(disponibilidad)
        .query(fecha).expect(400);
      expect(invalida.body).toMatchObject({ codigo: 'portal_400', accion: 'corregir' });
      expect(invalida.body.ranuras).toBeUndefined();
      // En el retroceso de noviembre, 01:30 es ambiguo y tampoco se ofrece.
      await db.query('DELETE FROM franjas_excepcion_horario WHERE excepcion_id=?',
        [excepcion.insertId]);
      await db.query('DELETE FROM excepciones_horario WHERE id=?', [excepcion.insertId]);
      await db.query(`UPDATE horarios_personal SET inicio_minutos=90,fin_minutos=150
        WHERE negocio_id=? AND personal_id=? AND dia_semana=0`, [a.id, a.profesionales[0]]);
      reloj.fijar(AHORA);
      const repetida = await request(app.getHttpServer()).get(disponibilidad)
        .query({ ...consulta, desde: '2026-11-01', hasta: '2026-11-01' }).expect(200);
      expect(repetida.body.ranuras).toEqual([]);
      expect(repetida.body.omisiones).toEqual([{ fechaLocal: '2026-11-01',
        motivo: expect.stringMatching(/inexistente|repetida|ambigua/) }]);
    });
  }, 60000);
});
