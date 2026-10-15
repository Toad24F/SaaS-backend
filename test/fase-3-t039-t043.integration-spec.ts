import type { EntityManager } from 'typeorm';
import { Rol } from '../src/auth/enums/rol.enum';
import type { ContextoDisponibilidad } from '../src/disponibilidad/contexto-disponibilidad.service';
import { OcupacionesService, ocupacionesQueSeEmpalman } from '../src/disponibilidad/ocupaciones.service';
import { conBaseMigrada } from './support/mariadb';
import { crearDatosOcupaciones } from './support/ocupaciones-fase-3';
import { RelojPrueba } from './support/reloj';

const ahora = new Date('2026-07-06T16:00:00.000Z');
const inicio = new Date('2026-07-06T17:00:00.000Z');
const fin = new Date('2026-07-06T18:00:00.000Z');
const fecha = (minutos: number) => new Date(inicio.getTime() + minutos * 60000);

function contexto(manager: EntityManager, negocioId: number, personalId: number,
  instante = ahora): ContextoDisponibilidad {
  return { manager, ahora: instante, actorId: personalId, rol: Rol.PROFESIONAL,
    negocioId, personalId };
}

describe('M2-T039–T043: ocupaciones reales', () => {
  it('lee citas de todos los estados ocupantes que atraviesan el rango, sin filtrar sede ni servicio', async () => {
    await conBaseMigrada(async (db) => {
      const [a, b] = (await crearDatosOcupaciones(db, new RelojPrueba(ahora))).negocios;
      const estados = ['pendiente', 'confirmada', 'completada', 'no_asistio', 'cancelada'];
      for (const [indice, estado] of estados.entries()) {
        await db.query(`INSERT INTO citas (negocio_id,personal_id,sucursal_id,servicio_id,
          cliente_id,inicio_utc,fin_utc,zona_horaria_reserva,estado,folio,origen)
          SELECT negocio_id,personal_id,sucursal_id,servicio_id,cliente_id,?,?,
          'America/Chihuahua',?,?,'manual' FROM citas WHERE id=?`,
        [fecha(-30), fecha(30), estado, `EST-${indice}`, a.citas[indice % 2]]);
      }
      const lector = new OcupacionesService();
      await db.transaction('REPEATABLE READ', async (manager) => {
        const resultado = await lector.consultar(contexto(manager, a.id, a.personalId),
          inicio, fin);
        const citas = resultado.filter((x) => x.tipo === 'cita' && x.inicioUtc.getTime() === fecha(-30).getTime());
        expect(citas.map((x) => x.estado).sort()).toEqual([
          'completada', 'confirmada', 'no_asistio', 'pendiente']);
        expect(citas.every((x) => x.finUtc.getTime() === fecha(30).getTime())).toBe(true);
        expect(resultado.every((x) => x.negocioId === a.id && x.personalId === a.personalId)).toBe(true);
        expect(resultado.some((x) => x.negocioId === b.id)).toBe(false);
      });
      // Cancelar una cita libera solo su intervalo; los otros estados persisten.
      await db.query("UPDATE citas SET estado='cancelada' WHERE id=?", [a.citas[1]]);
      await db.transaction('REPEATABLE READ', async (manager) => {
        const restantes = await lector.consultar(contexto(manager, a.id, a.personalId),
          inicio, fin);
        expect(restantes.some((x) => x.tipo === 'cita' && x.id === a.citas[1]))
          .toBe(false);
        expect(restantes.filter((x) => x.tipo === 'cita' &&
          x.inicioUtc.getTime() === fecha(-30).getTime())).toHaveLength(4);
      });
    });
  });

  it('usa el instante recibido: liberado o vencido exactamente no ocupa y las filas siguen guardadas', async () => {
    await conBaseMigrada(async (db) => {
      const [a] = (await crearDatosOcupaciones(db, new RelojPrueba(ahora))).negocios;
      await db.query(`UPDATE bloqueos_temporales SET inicio_utc=?, fin_utc=?, expira_en=?
        WHERE id IN (?,?)`, [inicio, fin, ahora, ...a.apartados]);
      const lector = new OcupacionesService();
      const leer = (instante: Date) => db.transaction('REPEATABLE READ', (manager) =>
        lector.consultar(contexto(manager, a.id, a.personalId, instante), inicio, fin));
      const vigentes = (await leer(new Date(ahora.getTime() - 1)))
        .filter((x) => x.tipo === 'apartado');
      expect(vigentes).toHaveLength(2);
      expect(vigentes.every((x) => !('titularHash' in x) && !('clienteId' in x)))
        .toBe(true);
      expect((await leer(ahora)).filter((x) => x.tipo === 'apartado')).toHaveLength(0);
      await db.query('UPDATE bloqueos_temporales SET expira_en=?, liberado_en=? WHERE id=?',
        [new Date(ahora.getTime() + 60000), ahora, a.apartados[0]]);
      expect((await leer(ahora)).filter((x) => x.tipo === 'apartado')).toHaveLength(0);
      const filas: { cantidad: string | number }[] = await db.query(
        'SELECT COUNT(*) cantidad FROM bloqueos_temporales WHERE negocio_id=?', [a.id]);
      expect(Number(filas[0].cantidad)).toBe(2);
    });
  });

  it('compara UTC entre zonas, días locales y servicios; conserva el fin histórico al cambiar duración', async () => {
    await conBaseMigrada(async (db) => {
      const [a] = (await crearDatosOcupaciones(db, new RelojPrueba(ahora))).negocios;
      await db.query(`UPDATE citas SET inicio_utc=?, fin_utc=?,
        zona_horaria_reserva='Pacific/Kiritimati', estado='confirmada' WHERE id=?`,
      [inicio, fecha(30), a.citas[1]]);
      await db.query('UPDATE servicios SET duracion_minutos=45 WHERE id=? AND negocio_id=?',
        [a.servicios[1], a.id]);
      const lector = new OcupacionesService();
      const resultado = await db.transaction('REPEATABLE READ', (manager) =>
        lector.consultar(contexto(manager, a.id, a.personalId), fecha(10), fecha(45)));
      const ajena = resultado.find((x) => x.tipo === 'cita' && x.id === a.citas[1]);
      expect(ajena).toMatchObject({ sucursalId: a.sucursales[1],
        servicioId: a.servicios[1], inicioUtc: inicio, finUtc: fecha(30) });
      expect(ocupacionesQueSeEmpalman(resultado, fecha(10), fecha(45)))
        .toContainEqual(ajena);
      expect(ocupacionesQueSeEmpalman(resultado, fecha(30), fecha(45)))
        .not.toContainEqual(ajena);
      // La misma hora UTC cae en fechas civiles distintas según la sucursal.
      const dia = (zonaHoraria: string) => new Intl.DateTimeFormat('en-CA',
        { timeZone: zonaHoraria, year: 'numeric', month: '2-digit', day: '2-digit' })
        .format(inicio);
      expect(dia('America/Chihuahua')).not.toBe(dia('Pacific/Kiritimati'));
    });
  });
});
