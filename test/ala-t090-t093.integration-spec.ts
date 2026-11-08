import type { EntityManager } from 'typeorm';
import { OcupacionesService } from '../src/disponibilidad/ocupaciones.service';
import type { ContextoCalculoDisponibilidad } from '../src/disponibilidad/contexto-disponibilidad.service';
import { conBaseMigrada } from './support/mariadb';
import { crearDatosOcupaciones } from './support/ocupaciones-fase-3';
import { RelojPrueba } from './support/reloj';

const hora = (valor: string) => new Date(`2026-07-06T${valor}:00.000Z`);
const contexto = (manager: EntityManager, negocioId: number, personalId: number,
  ahora: Date): ContextoCalculoDisponibilidad => ({ manager, negocioId, personalId, ahora });

describe('ALA-T091–T092: lectura de separación persistida', () => {
  it('incluye una cita de otra sede y servicio cuyo fin de atención precede al rango', async () => {
    await conBaseMigrada(async (db) => {
      const [a, b] = (await crearDatosOcupaciones(db, new RelojPrueba(hora('08:00')))).negocios;
      // La segunda sede termina el servicio a las 09:32; solo la separación
      // histórica puede hacerla visible en la consulta que comienza 09:35.
      await db.query(`UPDATE citas SET inicio_utc=?, fin_utc=?, separacion_minutos=10,
        fin_ocupacion_utc=? WHERE id=?`,
      [hora('09:00'), hora('09:32'), hora('09:42'), a.citas[1]]);
      const lector = new OcupacionesService();
      const leer = (negocioId: number, personalId: number) =>
        db.transaction('READ COMMITTED', (manager) => lector.consultar(
          contexto(manager, negocioId, personalId, hora('08:00')),
          hora('09:35'), hora('10:00')));
      expect(await leer(a.id, a.personalId)).toEqual(expect.arrayContaining([
        expect.objectContaining({ tipo: 'cita', id: a.citas[1],
          sucursalId: a.sucursales[1], servicioId: a.servicios[1],
          finUtc: hora('09:32'), finOcupacionUtc: hora('09:42') }),
      ]));
      expect((await leer(b.id, b.personalId)).some((x) => x.id === a.citas[1]
        && x.tipo === 'cita')).toBe(false);
    });
  });

  it('protege un apartado vigente y lo libera exactamente al expirar o al marcar liberación', async () => {
    await conBaseMigrada(async (db) => {
      const [a] = (await crearDatosOcupaciones(db, new RelojPrueba(hora('08:00')))).negocios;
      // Se guardan juntos los cuatro campos de concesión exigidos por la base.
      await db.query(`UPDATE bloqueos_temporales SET inicio_utc=?, fin_utc=?,
        separacion_minutos=10, fin_ocupacion_utc=?, modo_concesion='ventana_libre',
        version_reglas=1, expira_en=? WHERE id=?`,
      [hora('09:00'), hora('09:32'), hora('09:42'), hora('08:05'), a.apartados[1]]);
      const lector = new OcupacionesService();
      const leer = (ahora: Date) => db.transaction('READ COMMITTED', (manager) =>
        lector.consultar(contexto(manager, a.id, a.personalId, ahora),
          hora('09:35'), hora('10:00')));
      expect(await leer(hora('08:04'))).toEqual(expect.arrayContaining([
        expect.objectContaining({ tipo: 'apartado', id: a.apartados[1],
          finUtc: hora('09:32'), finOcupacionUtc: hora('09:42') }),
      ]));
      expect((await leer(hora('08:05'))).some((x) => x.tipo === 'apartado'
        && x.id === a.apartados[1])).toBe(false);
      await db.query('UPDATE bloqueos_temporales SET liberado_en=? WHERE id=?',
        [hora('08:03'), a.apartados[1]]);
      expect((await leer(hora('08:04'))).some((x) => x.tipo === 'apartado'
        && x.id === a.apartados[1])).toBe(false);
    });
  });
});
