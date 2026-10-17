import { randomUUID } from 'node:crypto';
import { AutorizacionService } from '../src/auth/services/autorizacion.service';
import { PoliticaAccesoLicenciaService } from '../src/licencias/services/politica-acceso-licencia.service';
import { ContextoDisponibilidadService } from '../src/disponibilidad/contexto-disponibilidad.service';
import { ConfiguracionAgendaService } from '../src/disponibilidad/configuracion-agenda.service';
import { OfertaEfectivaService } from '../src/disponibilidad/oferta-efectiva.service';
import { AtencionInternaService } from '../src/disponibilidad/atencion-interna.service';
import { BloqueosAplicablesService } from '../src/disponibilidad/bloqueos-aplicables.service';
import { OcupacionesService } from '../src/disponibilidad/ocupaciones.service';
import { MotorDisponibilidadService } from '../src/disponibilidad/motor-disponibilidad.service';
import { conBaseMigrada } from './support/mariadb';
import { crearDatosOcupaciones } from './support/ocupaciones-fase-3';
import { RelojPrueba } from './support/reloj';
import type { DataSource } from 'typeorm';

const ahora = new Date('2026-07-06T16:07:00.000Z'); // 10:07 en Chihuahua.
const fecha = '2026-07-06';
const h = (hora: string) => new Date(`2026-07-06T${hora}:00.000-06:00`);

async function preparar(db: DataSource) {
  const [negocio] = (await crearDatosOcupaciones(db, new RelojPrueba(ahora))).negocios;
  await db.query('DELETE FROM bloqueos_temporales WHERE negocio_id=?', [negocio.id]);
  await db.query('DELETE FROM citas WHERE negocio_id=?', [negocio.id]);
  await db.query('UPDATE negocios SET activado_en=creado_en WHERE id=?', [negocio.id]);
  await db.query(`INSERT INTO licencias (negocio_id,creado_en,habilitada_en,vence_en)
    VALUES (?,'2026-01-01','2026-01-01','2027-01-01')`, [negocio.id]);
  const sesionId = randomUUID();
  await db.query(`INSERT INTO sesiones (id,usuario_id,creada_en,expira_en)
    VALUES (?,?,'2026-07-06 12:00:00','2026-07-07 00:00:00')`,
  [sesionId, negocio.personalId]);
  await db.query(`INSERT INTO horarios_personal (negocio_id,personal_id,sucursal_id,
    dia_semana,orden,inicio_minutos,fin_minutos,activo)
    VALUES (?,?,?,1,0,540,780,1)`,
  [negocio.id, negocio.personalId, negocio.sucursales[0]]);
  return { negocio, token: { sub: negocio.personalId, sesionId } };
}

function motor(db: DataSource, reloj = new RelojPrueba(ahora)) {
  const permisos = new AutorizacionService();
  const contexto = new ContextoDisponibilidadService(permisos,
    new PoliticaAccesoLicenciaService());
  const configuracion = new ConfiguracionAgendaService(db, {} as never, permisos);
  const oferta = new OfertaEfectivaService(permisos);
  const atencion = new AtencionInternaService(new BloqueosAplicablesService());
  const ocupaciones = new OcupacionesService();
  return { servicio: new MotorDisponibilidadService(db, reloj, contexto,
    configuracion, oferta, atencion, ocupaciones),
  configuracion, oferta, atencion, ocupaciones };
}

describe('M2-T044–T049: cálculo privado con fuentes reales', () => {
  it('comparte manager e instante y devuelve Ventana Libre ordenada, anclada y sin datos privados', async () => {
    await conBaseMigrada(async (db) => {
      const { negocio, token } = await preparar(db);
      const { servicio, configuracion, oferta, atencion, ocupaciones } = motor(db);
      const contextos: Array<{ manager: unknown; ahora: number }> = [];
      const registrar = (ctx: { manager: unknown; ahora: Date }) =>
        contextos.push({ manager: ctx.manager, ahora: ctx.ahora.getTime() });
      const leerConfiguracion = configuracion.consultarEnContexto.bind(configuracion);
      jest.spyOn(configuracion, 'consultarEnContexto').mockImplementation(async (ctx) => {
        registrar(ctx); return leerConfiguracion(ctx);
      });
      const leerOferta = oferta.consultar.bind(oferta);
      jest.spyOn(oferta, 'consultar').mockImplementation(async (...args) => {
        registrar(args[0]); return leerOferta(...args);
      });
      const leerAtencion = atencion.consultar.bind(atencion);
      jest.spyOn(atencion, 'consultar').mockImplementation(async (...args) => {
        registrar(args[0]); return leerAtencion(...args);
      });
      const leerOcupaciones = ocupaciones.consultar.bind(ocupaciones);
      jest.spyOn(ocupaciones, 'consultar').mockImplementation(async (...args) => {
        registrar(args[0]); return leerOcupaciones(...args);
      });
      const r = await servicio.consultar(token, negocio.personalId,
        negocio.sucursales[0], negocio.servicios[0], fecha, fecha);
      expect(contextos).toHaveLength(4);
      expect(new Set(contextos.map((c) => c.manager)).size).toBe(1);
      expect(contextos.every((c) => c.ahora === ahora.getTime())).toBe(true);
      expect(r).toMatchObject({ negocioId: negocio.id,
        personalId: negocio.personalId, sucursalId: negocio.sucursales[0],
        servicioId: negocio.servicios[0], desde: fecha, hasta: fecha,
        zonaHoraria: 'America/Chihuahua', calculadoEn: ahora,
        modalidad: 'publica', reglas: { modo: 'ventana_libre', intervaloMinutos: 15 } });
      expect(r.ranuras[0]).toEqual({ inicioUtc: h('10:30'), finUtc: h('11:00') });
      expect(r.ranuras.map((x) => x.inicioUtc.getTime()))
        .toEqual([...new Set(r.ranuras.map((x) => x.inicioUtc.getTime()))].sort((a, b) => a - b));
      expect(JSON.stringify(r)).not.toMatch(/titularHash|clienteId|folio/);
    });
  });

  it('filtra ocupación, descanso, duración completa y extremos contiguos', async () => {
    await conBaseMigrada(async (db) => {
      const { negocio, token } = await preparar(db);
      await db.query(`UPDATE horarios_personal SET descanso_inicio_minutos=660,
        descanso_fin_minutos=690 WHERE negocio_id=?`, [negocio.id]);
      const cita = await db.query(`INSERT INTO citas (negocio_id,personal_id,sucursal_id,
        servicio_id,cliente_id,inicio_utc,fin_utc,zona_horaria_reserva,estado,folio,origen)
        SELECT negocio_id,?, ?, ?,id,?,?,'America/Chihuahua',
          'confirmada','MOTOR-1','manual' FROM clientes WHERE negocio_id=? LIMIT 1`,
      [negocio.personalId, negocio.sucursales[1], negocio.servicios[1],
        h('10:45'), h('11:00'), negocio.id]);
      expect(cita.insertId).toBeGreaterThan(0);
      const { servicio } = motor(db);
      const r = await servicio.consultar(token, negocio.personalId,
        negocio.sucursales[0], negocio.servicios[0], fecha, fecha);
      expect(r.ranuras.some((x) => x.inicioUtc.getTime() === h('10:30').getTime()))
        .toBe(false);
      expect(r.ranuras.some((x) => x.inicioUtc.getTime() === h('11:30').getTime()))
        .toBe(true);
      expect(r.ranuras.some((x) => x.inicioUtc.getTime() === h('12:45').getTime()))
        .toBe(false);
      // La puerta comercial descarta la combinación aunque todavía haya horario.
      await db.query('UPDATE servicios SET activo=0 WHERE id=? AND negocio_id=?',
        [negocio.servicios[0], negocio.id]);
      expect((await servicio.consultar(token, negocio.personalId,
        negocio.sucursales[0], negocio.servicios[0], fecha, fecha)).ranuras)
        .toEqual([]);
    });
  });

  it('aplica anticipación exacta, horizonte local cero y primer grupo de cada tramo compacto', async () => {
    await conBaseMigrada(async (db) => {
      const { negocio, token } = await preparar(db);
      await db.query(`INSERT INTO configuracion_agenda
        (negocio_id,modo,intervalo_minutos,anticipacion_minutos,dias_futuros)
        VALUES (?,'agenda_compacta',15,30,0)`, [negocio.id]);
      await db.query(`UPDATE horarios_personal SET descanso_inicio_minutos=720,
        descanso_fin_minutos=735 WHERE negocio_id=?`, [negocio.id]);
      const { servicio } = motor(db);
      const r = await servicio.consultar(token, negocio.personalId,
        negocio.sucursales[0], negocio.servicios[0], fecha, fecha);
      expect(r.ranuras).toEqual([
        { inicioUtc: h('10:45'), finUtc: h('11:15') },
        { inicioUtc: h('12:15'), finUtc: h('12:45') },
      ]);
      expect((await servicio.consultar(token, negocio.personalId,
        negocio.sucursales[0], negocio.servicios[0], '2026-07-07', '2026-07-07')).ranuras)
        .toEqual([]);
      expect(r.reglas.diasFuturos).toBe(0);
    });
  });

  it('incluye el último día del horizonte local y acepta el instante exacto de anticipación', async () => {
    await conBaseMigrada(async (db) => {
      const { negocio, token } = await preparar(db);
      await db.query(`INSERT INTO configuracion_agenda
        (negocio_id,modo,intervalo_minutos,anticipacion_minutos,dias_futuros)
        VALUES (?,'ventana_libre',15,30,1)`, [negocio.id]);
      await db.query(`INSERT INTO horarios_personal (negocio_id,personal_id,sucursal_id,
        dia_semana,orden,inicio_minutos,fin_minutos,activo)
        VALUES (?,?,?,2,0,540,600,1)`,
      [negocio.id, negocio.personalId, negocio.sucursales[0]]);
      const { servicio } = motor(db, new RelojPrueba(h('10:15')));
      const hoy = await servicio.consultar(token, negocio.personalId,
        negocio.sucursales[0], negocio.servicios[0], fecha, fecha);
      expect(hoy.ranuras[0].inicioUtc).toEqual(h('10:45'));
      const ultimo = await servicio.consultar(token, negocio.personalId,
        negocio.sucursales[0], negocio.servicios[0], '2026-07-07', '2026-07-07');
      expect(ultimo.ranuras).toHaveLength(3);
      expect(ultimo.ranuras[0].inicioUtc.toISOString()).toBe('2026-07-07T15:00:00.000Z');
    });
  });
});
