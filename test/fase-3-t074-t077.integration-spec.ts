import { createHash, randomUUID } from 'node:crypto';
import type { DataSource, EntityManager } from 'typeorm';
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
const inicioUtc = new Date('2026-07-06T16:30:00.000Z');
const finUtc = new Date('2026-07-06T17:00:00.000Z');
const hash = createHash('sha256').update('titular-comprobado').digest('hex');

async function escenario(ejecutar: (datos: {
  db: DataSource; reloj: RelojPrueba; motor: MotorDisponibilidadService;
  a: Awaited<ReturnType<typeof crearDatosOcupaciones>>['negocios'][number];
  b: Awaited<ReturnType<typeof crearDatosOcupaciones>>['negocios'][number];
  token: { sub: number; sesionId: string }; apartadoId: number;
  revalidar: (manager: EntityManager, apartadoPropio?: { id: number;
    titularHash: string }) => Promise<Awaited<ReturnType<MotorDisponibilidadService['revalidarEnTransaccion']>>>;
}) => Promise<void>) {
  await conBaseMigrada(async (db) => {
    const reloj = new RelojPrueba(ahora);
    const [a, b] = (await crearDatosOcupaciones(db, reloj)).negocios;
    await db.query('DELETE FROM bloqueos_temporales WHERE negocio_id=?', [a.id]);
    await db.query('DELETE FROM citas WHERE negocio_id=?', [a.id]);
    await db.query('UPDATE negocios SET activado_en=creado_en WHERE id=?', [a.id]);
    await db.query(`INSERT INTO licencias (negocio_id,creado_en,habilitada_en,vence_en)
      VALUES (?,'2026-01-01','2026-01-01','2027-01-01')`, [a.id]);
    const sesionId = randomUUID();
    await db.query(`INSERT INTO sesiones (id,usuario_id,creada_en,expira_en)
      VALUES (?,?,?,?)`, [sesionId, a.personalId,
      new Date(ahora.getTime() - 3600000), new Date(ahora.getTime() + 11 * 3600000)]);
    await db.query(`INSERT INTO horarios_personal
      (negocio_id,personal_id,sucursal_id,dia_semana,orden,
      inicio_minutos,fin_minutos,activo) VALUES (?,?,?,1,0,540,780,1)`,
    [a.id, a.personalId, a.sucursales[0]]);
    const alta = await db.query(`INSERT INTO bloqueos_temporales
      (negocio_id,personal_id,sucursal_id,servicio_id,inicio_utc,fin_utc,
      expira_en,titular_hash) VALUES (?,?,?,?,?,?,?,?)`,
    [a.id, a.personalId, a.sucursales[0], a.servicios[0], inicioUtc, finUtc,
      new Date('2026-07-06T16:40:00.000Z'), hash]);
    const apartadoId = Number(alta.insertId);
    const permisos = new AutorizacionService();
    const motor = new MotorDisponibilidadService(db, reloj,
      new ContextoDisponibilidadService(permisos, new PoliticaAccesoLicenciaService()),
      new ConfiguracionAgendaService(db, {} as never, permisos),
      new OfertaEfectivaService(permisos),
      new AtencionInternaService(new BloqueosAplicablesService()),
      new OcupacionesService());
    const token = { sub: a.personalId, sesionId };
    const revalidar = (manager: EntityManager, apartadoPropio?: {
      id: number; titularHash: string }) => motor.revalidarEnTransaccion(manager, token,
      { personalId: a.personalId, sucursalId: a.sucursales[0],
        servicioId: a.servicios[0], fechaLocal: '2026-07-06',
        horaInicio: '10:30', modalidad: 'manual', apartadoPropio });
    await ejecutar({ db, reloj, motor, a, b, token, apartadoId, revalidar });
  });
}

describe('M2-T074–T077: contrato de colaboración, sin reserva real', () => {
  it('revalida en el manager recibido y excluye solo un apartado propio íntegro', async () => {
    await escenario(async ({ db, a, motor, token, apartadoId, revalidar }) => {
      await expect(revalidar(db.manager)).rejects.toThrow(/transacción/);
      const resultado = await db.transaction('READ COMMITTED', async (manager) => {
        const abrirOtra = jest.spyOn(db, 'transaction');
        try {
          expect((await revalidar(manager)).motivos).toContain('ocupado');
          const lectura = await revalidar(manager,
            { id: apartadoId, titularHash: hash });
          const publica = await motor.revalidarEnTransaccion(manager, token,
            { personalId: a.personalId, sucursalId: a.sucursales[0],
              servicioId: a.servicios[0], fechaLocal: '2026-07-06',
              horaInicio: '10:30', modalidad: 'publica',
              apartadoPropio: { id: apartadoId, titularHash: hash } });
          expect(publica.valido).toBe(true);
          expect(abrirOtra).not.toHaveBeenCalled();
          return lectura;
        } finally { abrirOtra.mockRestore(); }
      });
      expect(resultado).toMatchObject({ valido: true, inicioUtc, finUtc,
        motivos: [] });
      // Un segundo apartado del mismo Profesional y servicio nunca se excluye.
      const otro = await db.query(`INSERT INTO bloqueos_temporales
        (negocio_id,personal_id,sucursal_id,servicio_id,inicio_utc,fin_utc,
        expira_en,titular_hash) VALUES (?,?,?,?,?,?,?,?)`,
      [a.id, a.personalId, a.sucursales[0], a.servicios[0], inicioUtc, finUtc,
        new Date('2026-07-06T16:41:00.000Z'), 'b'.repeat(64)]);
      expect((await db.transaction('READ COMMITTED', (manager) =>
        revalidar(manager, { id: apartadoId, titularHash: hash }))).motivos)
        .toContain('ocupado');
      await db.query('DELETE FROM bloqueos_temporales WHERE id=?', [otro.insertId]);
      const citas = await db.query('SELECT COUNT(*) total FROM citas WHERE negocio_id=?',
        [a.id]);
      const apartado = await db.query(`SELECT liberado_en,titular_hash FROM bloqueos_temporales
        WHERE id=?`, [apartadoId]);
      expect(Number(citas[0].total)).toBe(0);
      expect(apartado[0]).toMatchObject({ liberado_en: null, titular_hash: hash });
    });
  });

  it('rechaza identidad, combinación, intervalo y vigencia incompatibles', async () => {
    await escenario(async ({ db, reloj, a, b, apartadoId, revalidar }) => {
      const validar = (propio: { id: number; titularHash: string }) =>
        db.transaction('READ COMMITTED', (manager) => revalidar(manager, propio));
      expect((await validar({ id: apartadoId, titularHash: 'c'.repeat(64) })).valido)
        .toBe(false);
      // El ID de otra empresa tampoco autoriza exclusión, aunque el hash coincida.
      await db.query(`UPDATE bloqueos_temporales SET inicio_utc=?,fin_utc=?,
        expira_en=?,titular_hash=? WHERE id=?`,
      [inicioUtc, finUtc, new Date('2026-07-06T16:41:00Z'), hash, b.apartados[0]]);
      expect((await validar({ id: b.apartados[0], titularHash: hash })).valido)
        .toBe(false);
      await db.query('UPDATE bloqueos_temporales SET servicio_id=? WHERE id=?',
        [a.servicios[1], apartadoId]);
      expect((await validar({ id: apartadoId, titularHash: hash })).valido)
        .toBe(false);
      await db.query('UPDATE bloqueos_temporales SET servicio_id=? WHERE id=?',
        [a.servicios[0], apartadoId]);
      await db.query('UPDATE bloqueos_temporales SET sucursal_id=? WHERE id=?',
        [a.sucursales[1], apartadoId]);
      expect((await validar({ id: apartadoId, titularHash: hash })).valido)
        .toBe(false);
      await db.query('UPDATE bloqueos_temporales SET sucursal_id=? WHERE id=?',
        [a.sucursales[0], apartadoId]);
      const otraCuenta = await db.query(`INSERT INTO usuarios
        (negocio_id,nombre,email,password_hash,rol,activo,activado_en)
        VALUES (?,'Otra profesional','otra-colaboracion@example.test','hash',
          'profesional',1,CURRENT_TIMESTAMP(6))`, [a.id]);
      const otroPerfil = Number(otraCuenta.insertId);
      await db.query('INSERT INTO personal (id,negocio_id) VALUES (?,?)',
        [otroPerfil, a.id]);
      await db.query('UPDATE bloqueos_temporales SET personal_id=? WHERE id=?',
        [otroPerfil, apartadoId]);
      expect((await validar({ id: apartadoId, titularHash: hash })).valido)
        .toBe(false);
      await db.query('UPDATE bloqueos_temporales SET personal_id=? WHERE id=?',
        [a.personalId, apartadoId]);
      await db.query('UPDATE bloqueos_temporales SET fin_utc=? WHERE id=?',
        [new Date('2026-07-06T17:01:00Z'), apartadoId]);
      expect((await validar({ id: apartadoId, titularHash: hash })).valido)
        .toBe(false);
      await db.query('UPDATE bloqueos_temporales SET fin_utc=? WHERE id=?',
        [finUtc, apartadoId]);
      reloj.fijar(new Date('2026-07-06T16:40:00Z'));
      expect((await validar({ id: apartadoId, titularHash: hash })).valido)
        .toBe(false);
      reloj.fijar(ahora);
      await db.query('UPDATE bloqueos_temporales SET liberado_en=? WHERE id=?',
        [ahora, apartadoId]);
      expect((await validar({ id: apartadoId, titularHash: hash })).valido)
        .toBe(false);
    });
  });

  it('relee oferta, duración, horario y otras ocupaciones tras la consulta previa', async () => {
    await escenario(async ({ db, a, motor, token, apartadoId, revalidar }) => {
      const ids = [token, a.personalId, a.sucursales[0], a.servicios[0]] as const;
      const previo = await motor.consultar(...ids, '2026-07-06', '2026-07-06');
      expect(previo.calculadoEn).toEqual(ahora);
      const validar = () => db.transaction('READ COMMITTED', (manager) =>
        revalidar(manager, { id: apartadoId, titularHash: hash }));
      expect((await validar()).valido).toBe(true);
      await db.query('UPDATE servicios SET activo=0 WHERE id=?', [a.servicios[0]]);
      expect((await validar()).valido).toBe(false);
      await db.query('UPDATE servicios SET activo=1,duracion_minutos=45 WHERE id=?',
        [a.servicios[0]]);
      expect((await validar()).motivos).toContain('apartado_no_vigente_o_incompatible');
      await db.query('UPDATE servicios SET duracion_minutos=30 WHERE id=?',
        [a.servicios[0]]);
      await db.query('UPDATE horarios_personal SET fin_minutos=600 WHERE negocio_id=?',
        [a.id]);
      expect((await validar()).motivos).toContain('fuera_de_atencion');
      await db.query('UPDATE horarios_personal SET fin_minutos=780 WHERE negocio_id=?',
        [a.id]);
      const cliente = await db.query('SELECT id FROM clientes WHERE negocio_id=? LIMIT 1',
        [a.id]);
      await db.query(`INSERT INTO citas (negocio_id,personal_id,sucursal_id,servicio_id,
        cliente_id,inicio_utc,fin_utc,zona_horaria_reserva,estado,folio,origen)
        VALUES (?,?,?,?,?,?,?,'America/Chihuahua','confirmada',?,'manual')`,
      [a.id, a.personalId, a.sucursales[1], a.servicios[1], cliente[0].id,
        inicioUtc, finUtc, `COL-${randomUUID().slice(0, 8)}`]);
      expect((await validar()).motivos).toContain('ocupado');
    });
  });
});
