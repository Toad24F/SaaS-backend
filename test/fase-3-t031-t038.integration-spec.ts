import type { DataSource, EntityManager } from 'typeorm';
import { conBaseMigrada } from './support/mariadb';
import { crearDatosOcupaciones } from './support/ocupaciones-fase-3';
import { RelojPrueba } from './support/reloj';
import { Rol } from '../src/auth/enums/rol.enum';
import type { ContextoDisponibilidad } from '../src/disponibilidad/contexto-disponibilidad.service';
import { BloqueosAplicablesService } from '../src/disponibilidad/bloqueos-aplicables.service';
import { AtencionInternaService } from '../src/disponibilidad/atencion-interna.service';
import { cabeEnAtencion, iniciosAnclados } from '../src/disponibilidad/proyeccion-atencion';

const fecha = '2026-07-06';
const ahora = new Date('2026-07-06T12:00:00.000Z');
const h = (hora: string) => new Date(`2026-07-06T${hora}:00.000-06:00`);

function contexto(manager: EntityManager, negocioId: number, personalId: number):
  ContextoDisponibilidad {
  return { manager, ahora, actorId: personalId, rol: Rol.PROFESIONAL,
    negocioId, personalId };
}

async function franja(db: DataSource, negocioId: number, personalId: number,
  sucursalId: number, diaSemana: number, inicio: number, fin: number,
  descansoInicio: number | null = null, descansoFin: number | null = null) {
  const alta = await db.query(`INSERT INTO horarios_personal (negocio_id,personal_id,
    sucursal_id,dia_semana,orden,inicio_minutos,fin_minutos,
    descanso_inicio_minutos,descanso_fin_minutos,activo)
    VALUES (?,?,?,?,0,?,?,?,?,1)`,
  [negocioId, personalId, sucursalId, diaSemana, inicio, fin,
    descansoInicio, descansoFin]);
  return Number(alta.insertId);
}

async function bloqueo(db: DataSource, negocioId: number, creadorId: number,
  personalId: number | null, sucursalId: number | null, inicio: number,
  fin: number) {
  const alta = await db.query(`INSERT INTO bloqueos_horario (negocio_id,personal_id,
    sucursal_id,creador_usuario_id,tipo,motivo,fecha_inicio,fecha_fin,
    inicio_minutos,fin_minutos) VALUES (?,?,?,?,'emergencia','Prueba',?,?,?,?)`,
  [negocioId, personalId, sucursalId, creadorId, fecha, fecha, inicio, fin]);
  return Number(alta.insertId);
}

describe('M2-T031–T038: lectura transaccional de atención', () => {
  it('conserva origen, excepción vacía y anclajes tras descanso y bloqueos', async () => {
    await conBaseMigrada(async (db) => {
      const [a, b] = (await crearDatosOcupaciones(db, new RelojPrueba(ahora))).negocios;
      const [sede, otra] = a.sucursales;
      const primero = await franja(db, a.id, a.personalId, sede, 1, 540, 660, 600, 607);
      const segundo = await franja(db, a.id, a.personalId, sede, 1, 660, 780);
      await franja(db, a.id, a.personalId, otra, 1, 540, 780);
      await franja(db, b.id, b.personalId, b.sucursales[0], 1, 540, 780);
      const colectivo = await bloqueo(db, a.id, a.personalId, null, sede, 605, 620);
      const personal = await bloqueo(db, a.id, a.personalId, a.personalId, null, 700, 715);
      await bloqueo(db, b.id, b.personalId, null, null, 540, 780);
      const servicio = new AtencionInternaService(new BloqueosAplicablesService());
      await db.transaction('REPEATABLE READ', async (manager) => {
        const ctx = contexto(manager, a.id, a.personalId);
        const cortes = await new BloqueosAplicablesService()
          .consultar(ctx, sede, fecha, fecha, 'America/Chihuahua');
        expect(cortes.map((x) => x.id)).toEqual([colectivo, personal]);
        expect(cortes.map((x) => [x.inicio.toISOString(), x.fin.toISOString()]))
          .toEqual([[h('10:05').toISOString(), h('10:20').toISOString()],
            [h('11:40').toISOString(), h('11:55').toISOString()]]);
        const resultado = await servicio.consultar(ctx, sede, fecha, fecha);
        expect(resultado.bloques.map((x) => [x.id, x.origen, x.fechaLocal,
          x.sucursalId, x.zonaHoraria])).toEqual([
          [primero, 'semanal', fecha, sede, 'America/Chihuahua'],
          [segundo, 'semanal', fecha, sede, 'America/Chihuahua'],
        ]);
        expect(resultado.tramos.map((x) => [x.bloque.id,
          x.inicioUtc.toISOString().slice(11, 16), x.finUtc.toISOString().slice(11, 16)]))
          .toEqual([[primero, '15:00', '16:00'], [primero, '16:20', '17:00'],
            [segundo, '17:00', '17:40'], [segundo, '17:55', '19:00']]);
        expect(cabeEnAtencion(resultado.tramos, sede, h('10:30'), h('11:30')))
          .toBe(true);
        expect(cabeEnAtencion(resultado.tramos, sede, h('10:30'), h('11:41')))
          .toBe(false);
        expect(iniciosAnclados(resultado.bloques, resultado.tramos, 15, 30)
          .map((d) => d.toISOString().slice(11, 16))).toContain('16:30');
      });
      // Una excepción sin hijas reemplaza únicamente esa fecha y sucursal.
      await db.query(`INSERT INTO excepciones_horario
        (negocio_id,personal_id,sucursal_id,fecha_local) VALUES (?,?,?,?)`,
      [a.id, a.personalId, sede, fecha]);
      await db.transaction('REPEATABLE READ', async (manager) => {
        const ctx = contexto(manager, a.id, a.personalId);
        expect((await servicio.consultar(ctx, sede, fecha, fecha)).bloques).toEqual([]);
        expect((await servicio.consultar(ctx, otra, fecha, fecha)).bloques).toHaveLength(1);
      });
    });
  });

  it('una excepción explícita conserva su origen y las restricciones restantes', async () => {
    await conBaseMigrada(async (db) => {
      const [a] = (await crearDatosOcupaciones(db, new RelojPrueba(ahora))).negocios;
      const sede = a.sucursales[0];
      await franja(db, a.id, a.personalId, sede, 1, 540, 780);
      const excepcion = await db.query(`INSERT INTO excepciones_horario
        (negocio_id,personal_id,sucursal_id,fecha_local) VALUES (?,?,?,?)`,
      [a.id, a.personalId, sede, fecha]);
      const hija = await db.query(`INSERT INTO franjas_excepcion_horario
        (negocio_id,excepcion_id,orden,inicio_minutos,fin_minutos)
        VALUES (?,?,0,540,780)`, [a.id, excepcion.insertId]);
      const uno = await bloqueo(db, a.id, a.personalId, null, null, 600, 630);
      await bloqueo(db, a.id, a.personalId, a.personalId, sede, 620, 640);
      const lector = new AtencionInternaService(new BloqueosAplicablesService());
      const consultar = () => db.transaction('REPEATABLE READ', (manager) =>
        lector.consultar(contexto(manager, a.id, a.personalId), sede, fecha, fecha));
      let resultado = await consultar();
      expect(resultado.bloques).toMatchObject([{ id: Number(hija.insertId),
        origen: 'excepcion' }]);
      expect(cabeEnAtencion(resultado.tramos, sede, h('09:30'), h('10:01')))
        .toBe(false);
      await db.query('DELETE FROM bloqueos_horario WHERE id=?', [uno]);
      resultado = await consultar();
      expect(cabeEnAtencion(resultado.tramos, sede, h('09:30'), h('10:01')))
        .toBe(true);
      expect(cabeEnAtencion(resultado.tramos, sede, h('10:20'), h('10:30')))
        .toBe(false);
    });
  });

  it('omite recurrencia DST y rechaza la misma franja si es excepción explícita', async () => {
    await conBaseMigrada(async (db) => {
      const [a] = (await crearDatosOcupaciones(db, new RelojPrueba(ahora))).negocios;
      const sede = a.sucursales[0];
      await db.query('UPDATE sucursales SET zona_horaria=? WHERE id=? AND negocio_id=?',
        ['America/New_York', sede, a.id]);
      await franja(db, a.id, a.personalId, sede, 0, 120, 210);
      const lector = new AtencionInternaService(new BloqueosAplicablesService());
      const consultar = () => db.transaction('REPEATABLE READ', (manager) =>
        lector.consultar(contexto(manager, a.id, a.personalId), sede,
          '2026-03-08', '2026-03-08'));
      expect(await consultar()).toMatchObject({ bloques: [], omisiones: [
        { fechaLocal: '2026-03-08', motivo: expect.stringMatching(/inexistente|repetida/) },
      ] });
      const excepcion = await db.query(`INSERT INTO excepciones_horario
        (negocio_id,personal_id,sucursal_id,fecha_local) VALUES (?,?,?,'2026-03-08')`,
      [a.id, a.personalId, sede]);
      await db.query(`INSERT INTO franjas_excepcion_horario
        (negocio_id,excepcion_id,orden,inicio_minutos,fin_minutos)
        VALUES (?,?,0,120,210)`, [a.id, excepcion.insertId]);
      await expect(consultar()).rejects.toMatchObject({ status: 400 });
    });
  });
});
