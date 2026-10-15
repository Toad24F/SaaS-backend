import { randomUUID, createHash } from 'node:crypto';
import type { DataSource } from 'typeorm';
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

const ahora = new Date('2026-07-06T16:07:00.000Z');
const h = (hora: string) => new Date(`2026-07-06T${hora}:00.000-06:00`);

async function preparar(db: DataSource, instante = ahora) {
  const [negocio] = (await crearDatosOcupaciones(db, new RelojPrueba(instante))).negocios;
  await db.query('DELETE FROM bloqueos_temporales WHERE negocio_id=?', [negocio.id]);
  await db.query('DELETE FROM citas WHERE negocio_id=?', [negocio.id]);
  await db.query('UPDATE negocios SET activado_en=creado_en WHERE id=?', [negocio.id]);
  await db.query(`INSERT INTO licencias (negocio_id,creado_en,habilitada_en,vence_en)
    VALUES (?,'2026-01-01','2026-01-01','2027-01-01')`, [negocio.id]);
  const sesionId = randomUUID();
  const creada = new Date(instante.getTime() - 3600000);
  await db.query('INSERT INTO sesiones (id,usuario_id,creada_en,expira_en) VALUES (?,?,?,?)',
    [sesionId, negocio.personalId, creada, new Date(creada.getTime() + 12 * 3600000)]);
  await db.query(`INSERT INTO horarios_personal (negocio_id,personal_id,sucursal_id,
    dia_semana,orden,inicio_minutos,fin_minutos,activo)
    VALUES (?,?,?,1,0,540,780,1)`,
  [negocio.id, negocio.personalId, negocio.sucursales[0]]);
  const permisos = new AutorizacionService();
  const servicio = new MotorDisponibilidadService(db, new RelojPrueba(instante),
    new ContextoDisponibilidadService(permisos, new PoliticaAccesoLicenciaService()),
    new ConfiguracionAgendaService(db, {} as never, permisos),
    new OfertaEfectivaService(permisos),
    new AtencionInternaService(new BloqueosAplicablesService()),
    new OcupacionesService());
  return { negocio, token: { sub: negocio.personalId, sesionId }, servicio };
}

async function cita(db: DataSource, f: Awaited<ReturnType<typeof preparar>>,
  inicio: Date, fin: Date, sucursal = f.negocio.sucursales[1],
  servicio = f.negocio.servicios[1]) {
  const filas: { id: number }[] = await db.query(
    'SELECT id FROM clientes WHERE negocio_id=? LIMIT 1', [f.negocio.id]);
  const alta = await db.query(`INSERT INTO citas (negocio_id,personal_id,sucursal_id,
    servicio_id,cliente_id,inicio_utc,fin_utc,zona_horaria_reserva,estado,folio,origen)
    VALUES (?,?,?,?,?,?,?,'America/Chihuahua','confirmada',?,'manual')`,
  [f.negocio.id, f.negocio.personalId, sucursal, servicio, filas[0].id,
    inicio, fin, `CM-${randomUUID().slice(0, 12)}`]);
  return Number(alta.insertId);
}

async function apartado(db: DataSource, f: Awaited<ReturnType<typeof preparar>>,
  inicio: Date, fin: Date, expiraEn: Date) {
  const alta = await db.query(`INSERT INTO bloqueos_temporales (negocio_id,personal_id,
    sucursal_id,servicio_id,inicio_utc,fin_utc,expira_en,titular_hash)
    VALUES (?,?,?,?,?,?,?,?)`,
  [f.negocio.id, f.negocio.personalId, f.negocio.sucursales[1],
    f.negocio.servicios[1], inicio, fin, expiraEn,
    createHash('sha256').update(randomUUID()).digest('hex')]);
  return Number(alta.insertId);
}

describe('M2-T050–T056: compactación, manual y validación puntual', () => {
  it('usa referencias de otra sede/servicio y apartados vigentes; al vencer abre grupo nuevo', async () => {
    await conBaseMigrada(async (db) => {
      const f = await preparar(db);
      await db.query(`INSERT INTO configuracion_agenda
        (negocio_id,modo,intervalo_minutos,anticipacion_minutos,dias_futuros)
        VALUES (?,'agenda_compacta',15,0,60)`, [f.negocio.id]);
      await cita(db, f, h('11:00'), h('11:30'));
      const id = await apartado(db, f, h('12:00'), h('12:30'),
        new Date(ahora.getTime() + 60000));
      const leer = () => f.servicio.consultar(f.token, f.negocio.personalId,
        f.negocio.sucursales[0], f.negocio.servicios[0], '2026-07-06', '2026-07-06');
      const vigente = await leer();
      expect(vigente.ranuras.map((r) => r.inicioUtc.toISOString())).toEqual([
        h('10:30').toISOString(), h('11:30').toISOString(),
        h('12:30').toISOString(),
      ]);
      // La fila queda persistida; solo el reloj decide si sigue siendo referencia.
      await db.query('UPDATE bloqueos_temporales SET expira_en=? WHERE id=?', [ahora, id]);
      const vencido = await leer();
      expect(vencido.ranuras.map((r) => r.inicioUtc.toISOString())).toEqual([
        h('10:30').toISOString(), h('11:30').toISOString(),
      ]);
      // El lunes siguiente conserva su propio grupo aunque el actual tenga huecos.
      expect((await f.servicio.consultar(f.token, f.negocio.personalId,
        f.negocio.sucursales[0], f.negocio.servicios[0],
        '2026-07-13', '2026-07-13')).ranuras[0].inicioUtc)
        .toEqual(new Date('2026-07-13T15:00:00Z'));
    });
  });

  it('manual admite 10:07 fuera de secuencia y omite anticipación, horizonte y compactación', async () => {
    await conBaseMigrada(async (db) => {
      const f = await preparar(db);
      await db.query(`INSERT INTO configuracion_agenda
        (negocio_id,modo,intervalo_minutos,anticipacion_minutos,dias_futuros)
        VALUES (?,'agenda_compacta',15,120,0)`, [f.negocio.id]);
      const ids = [f.token, f.negocio.personalId, f.negocio.sucursales[0],
        f.negocio.servicios[0]] as const;
      expect(await f.servicio.validar(...ids, '2026-07-06', '10:07', 'manual'))
        .toMatchObject({ valido: true, inicioUtc: h('10:07'), finUtc: h('10:37'),
          motivos: [] });
      expect(await f.servicio.validar(...ids, '2026-07-06', '10:07', 'publica'))
        .toMatchObject({ valido: false, motivos: expect.arrayContaining([
          'anticipacion_insuficiente']) });
      const futuro = await f.servicio.consultar(...ids, '2026-07-13', '2026-07-13', 'manual');
      expect(futuro.ranuras[0].inicioUtc).toEqual(new Date('2026-07-13T15:00:00Z'));
      expect((await f.servicio.consultar(...ids, '2026-07-13', '2026-07-13',
        'publica')).ranuras).toEqual([]);
      await db.query(`UPDATE configuracion_agenda SET anticipacion_minutos=2880
        WHERE negocio_id=?`, [f.negocio.id]);
      expect((await f.servicio.consultar(...ids, '2026-07-06', '2026-07-06',
        'publica')).ranuras).toEqual([]);
      expect((await f.servicio.validar(...ids, '2026-07-06', '10:07',
        'manual')).valido).toBe(true);
    });
  });

  it('manual rechaza pasado, descanso, cierre, oferta inactiva y empalme de otra sucursal', async () => {
    await conBaseMigrada(async (db) => {
      const f = await preparar(db);
      const ids = [f.token, f.negocio.personalId, f.negocio.sucursales[0],
        f.negocio.servicios[0]] as const;
      await db.query(`UPDATE horarios_personal SET descanso_inicio_minutos=660,
        descanso_fin_minutos=690 WHERE negocio_id=?`, [f.negocio.id]);
      expect((await f.servicio.validar(...ids, '2026-07-06', '10:06', 'manual')).motivos)
        .toContain('inicio_pasado');
      expect((await f.servicio.validar(...ids, '2026-07-06', '10:45', 'manual')).motivos)
        .toContain('fuera_de_atencion');
      expect((await f.servicio.validar(...ids, '2026-07-06', '12:45', 'manual')).motivos)
        .toContain('fuera_de_atencion');
      await cita(db, f, h('10:30'), h('11:00'));
      expect((await f.servicio.validar(...ids, '2026-07-06', '10:15', 'manual')).motivos)
        .toContain('ocupado');
      await db.query('UPDATE servicios SET activo=0 WHERE id=? AND negocio_id=?',
        [f.negocio.servicios[0], f.negocio.id]);
      expect((await f.servicio.validar(...ids, '2026-07-06', '10:07', 'manual')).motivos)
        .toContain('servicio_inactivo');
      // La validación solo consulta: conserva la cita y no crea apartados.
      const filas: { cantidad: string | number }[] = await db.query(
        'SELECT COUNT(*) cantidad FROM bloqueos_temporales WHERE negocio_id=?',
        [f.negocio.id]);
      expect(Number(filas[0].cantidad)).toBe(0);
      await db.query("UPDATE licencias SET vence_en='2026-07-01' WHERE negocio_id=?",
        [f.negocio.id]);
      await expect(f.servicio.validar(...ids, '2026-07-06', '10:07', 'manual'))
        .rejects.toMatchObject({ status: 401 });
    });
  });

  it('valida pertenencia a estrategia pública, día 60 inclusivo y medianoche local', async () => {
    await conBaseMigrada(async (db) => {
      // 05:59Z todavía es domingo 23:59 en Chihuahua; 06:00Z ya es lunes.
      const f = await preparar(db, new Date('2026-07-06T05:59:00Z'));
      await db.query(`INSERT INTO configuracion_agenda
        (negocio_id,modo,intervalo_minutos,anticipacion_minutos,dias_futuros)
        VALUES (?,'agenda_compacta',15,0,60)`, [f.negocio.id]);
      const ids = [f.token, f.negocio.personalId, f.negocio.sucursales[0],
        f.negocio.servicios[0]] as const;
      const lunes = await f.servicio.consultar(...ids, '2026-07-06', '2026-07-06');
      expect(lunes.ranuras[0].inicioUtc).toEqual(h('09:00'));
      expect((await f.servicio.validar(...ids, '2026-07-06', '09:15',
        'publica')).motivos).toContain('no_ofrecido_por_estrategia');
      const ultima = new Date(Date.parse('2026-07-05T00:00:00Z') + 60 * 86400000)
        .toISOString().slice(0, 10);
      const diaSemana = new Date(`${ultima}T00:00:00Z`).getUTCDay();
      await db.query(`INSERT INTO horarios_personal (negocio_id,personal_id,sucursal_id,
        dia_semana,orden,inicio_minutos,fin_minutos,activo)
        VALUES (?,?,?,?,0,540,600,1)`,
      [f.negocio.id, f.negocio.personalId, f.negocio.sucursales[0], diaSemana]);
      expect((await f.servicio.consultar(...ids, ultima, ultima)).ranuras)
        .toHaveLength(1);
      const siguiente = new Date(Date.parse(`${ultima}T00:00:00Z`) + 86400000)
        .toISOString().slice(0, 10);
      expect((await f.servicio.consultar(...ids, siguiente, siguiente)).ranuras)
        .toEqual([]);
    });
  });
});
