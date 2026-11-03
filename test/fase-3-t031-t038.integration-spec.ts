import { DataSource } from 'typeorm';
import { AtencionInternaService } from '../src/disponibilidad/atencion-interna.service';
import { BloqueosAplicablesService } from '../src/disponibilidad/bloqueos-aplicables.service';
import type { ContextoDisponibilidad } from '../src/disponibilidad/contexto-disponibilidad.service';
import { Rol } from '../src/auth/enums/rol.enum';
import { conBaseMigrada } from './support/mariadb';
import { crearDatosOcupaciones } from './support/ocupaciones-fase-3';
import { RelojPrueba } from './support/reloj';

const AHORA = new Date('2026-07-06T12:00:00.000Z');
const FECHA = '2026-07-06';

/** Relee la atención real; los datos retirados siguen en SQL hasta transición explícita. */
async function consultar(db: DataSource, negocioId: number, personalId: number,
  sucursalId: number, fecha = FECHA) {
  const servicio = new AtencionInternaService(new BloqueosAplicablesService());
  return db.transaction('READ COMMITTED', (manager) => {
    const contexto: ContextoDisponibilidad = { manager, negocioId, personalId,
      ahora: AHORA, actorId: personalId, rol: Rol.PROFESIONAL };
    return servicio.consultar(contexto, sucursalId, fecha, fecha);
  });
}

describe('M2-T031–T038 adaptado a ALA RF-36–RF-38', () => {
  it('RF-36 bloquea un descanso histórico y luego usa huecos entre franjas', async () => {
    await conBaseMigrada(async (db) => {
      const [a] = (await crearDatosOcupaciones(db, new RelojPrueba(AHORA))).negocios;
      const sede = a.sucursales[0];
      const alta = await db.query(`INSERT INTO horarios_personal
        (negocio_id,personal_id,sucursal_id,dia_semana,orden,inicio_minutos,
         fin_minutos,descanso_inicio_minutos,descanso_fin_minutos,activo)
        VALUES (?,?,?,1,0,540,780,600,615,1)`, [a.id, a.personalId, sede]);
      // ALA RF-36 exige transición: el descanso almacenado no vuelve a
      // operar silenciosamente como si fuera una franja actual.
      await expect(consultar(db, a.id, a.personalId, sede))
        .rejects.toMatchObject({ status: 409 });
      await db.query(`UPDATE horarios_personal SET inicio_minutos=540,
        fin_minutos=600,descanso_inicio_minutos=NULL,descanso_fin_minutos=NULL
        WHERE id=?`, [alta.insertId]);
      await db.query(`INSERT INTO horarios_personal
        (negocio_id,personal_id,sucursal_id,dia_semana,orden,inicio_minutos,
         fin_minutos,activo) VALUES (?,?,?,1,1,615,780,1)`,
      [a.id, a.personalId, sede]);
      const resultado = await consultar(db, a.id, a.personalId, sede);
      expect(resultado.bloques).toHaveLength(2);
      expect(resultado.tramos).toHaveLength(2);
    });
  });

  it('RF-37 conserva filas antiguas de excepción y exige transición antes de leer', async () => {
    await conBaseMigrada(async (db) => {
      const [a, b] = (await crearDatosOcupaciones(db, new RelojPrueba(AHORA))).negocios;
      const sede = a.sucursales[0];
      await db.query(`INSERT INTO horarios_personal
        (negocio_id,personal_id,sucursal_id,dia_semana,orden,inicio_minutos,
         fin_minutos,activo) VALUES (?,?,?,1,0,540,780,1)`,
      [a.id, a.personalId, sede]);
      const excepcion = await db.query(`INSERT INTO excepciones_horario
        (negocio_id,personal_id,sucursal_id,fecha_local) VALUES (?,?,?,?)`,
      [a.id, a.personalId, sede, FECHA]);
      await expect(consultar(db, a.id, a.personalId, sede))
        .rejects.toMatchObject({ status: 409 });
      expect((await db.query(`SELECT COUNT(*) AS n FROM excepciones_horario
        WHERE id=?`, [excepcion.insertId]))[0].n).toBe('1');
      // El obstáculo se aísla por tenant y perfil, sin bloquear la lectura ajena.
      expect((await consultar(db, b.id, b.personalId, b.sucursales[0])).bloques)
        .toHaveLength(0);
      await db.query('DELETE FROM excepciones_horario WHERE id=?', [excepcion.insertId]);
      expect((await consultar(db, a.id, a.personalId, sede)).bloques).toHaveLength(1);
    });
  });

  it('RF-37 rechaza también excepción antigua sobre la fecha de cambio DST', async () => {
    await conBaseMigrada(async (db) => {
      const [a] = (await crearDatosOcupaciones(db, new RelojPrueba(AHORA))).negocios;
      const sede = a.sucursales[0];
      await db.query('UPDATE sucursales SET zona_horaria=? WHERE id=?',
        ['America/New_York', sede]);
      await db.query(`INSERT INTO horarios_personal
        (negocio_id,personal_id,sucursal_id,dia_semana,orden,inicio_minutos,
         fin_minutos,activo) VALUES (?,?,?,0,0,120,210,1)`,
      [a.id, a.personalId, sede]);
      const sinExcepcion = await consultar(db, a.id, a.personalId,
        sede, '2026-03-08');
      expect(sinExcepcion.omisiones).toHaveLength(1);
      await db.query(`INSERT INTO excepciones_horario
        (negocio_id,personal_id,sucursal_id,fecha_local)
        VALUES (?,?,?,'2026-03-08')`, [a.id, a.personalId, sede]);
      await expect(consultar(db, a.id, a.personalId, sede, '2026-03-08'))
        .rejects.toMatchObject({ status: 409 });
    });
  });
});
