import { conBaseMigrada } from './support/mariadb';
import { Negocio } from '../src/negocios/entities/negocio.entity';
import { Usuario } from '../src/usuarios/entities/usuario.entity';
import { Rol } from '../src/auth/enums/rol.enum';

// Fixtures mínimas: el FK de asignación debe impedir cualquier sucursal ajena.
async function datos(db: Parameters<Parameters<typeof conBaseMigrada>[0]>[0]) {
  const ahora = new Date();
  const negocios: Negocio[] = [];
  const sucursales: number[] = [];
  for (const letra of ['a', 'b']) {
    const negocio = await db.getRepository(Negocio).save({ nombre: letra,
      slug: `horario-${letra}`, emailContacto: `${letra}@example.test`,
      activadoEn: ahora, limiteSucursalesActivas: 2 });
    negocios.push(negocio);
    const sucursal = await db.query(`INSERT INTO sucursales
      (negocio_id,nombre,direccion,telefono,zona_horaria)
      VALUES (?,'Centro','Calle Uno','6141234567','UTC')`, [negocio.id]);
    sucursales.push(Number(sucursal.insertId));
  }
  const usuario = await db.getRepository(Usuario).save({ negocioId: negocios[0].id,
    nombre: 'Ana', email: 'horario-ana@example.test', passwordHash: 'hash',
    rol: Rol.PROFESIONAL, activo: true, creadoEn: ahora, activadoEn: ahora });
  await db.query('INSERT INTO personal (id,negocio_id) VALUES (?,?)',
    [usuario.id, negocios[0].id]);
  await db.query('INSERT INTO personal_sucursales (negocio_id,personal_id,sucursal_id) VALUES (?,?,?)',
    [negocios[0].id, usuario.id, sucursales[0]]);
  return { negocioId: negocios[0].id, personalId: usuario.id,
    sucursalId: sucursales[0], ajenaId: sucursales[1] };
}

describe('M1-T083–T085: migraciones de franjas y excepciones', () => {
  it('conserva borradores parciales y exige franja completa al activar', async () => {
    await conBaseMigrada(async (db) => {
      const { negocioId, personalId, sucursalId, ajenaId } = await datos(db);
      const borrador = await db.query(`INSERT INTO horarios_personal
        (negocio_id,personal_id,dia_semana,orden,activo,inicio_minutos)
        VALUES (?,?,1,0,0,540)`, [negocioId, personalId]);
      const id = Number(borrador.insertId);
      const filas = await db.query('SELECT * FROM horarios_personal WHERE id = ?', [id]);
      expect(filas[0]).toMatchObject({ id, negocio_id: negocioId, personal_id: personalId,
        dia_semana: 1, sucursal_id: null, inicio_minutos: 540,
        fin_minutos: null, activo: 0 });
      await expect(db.query('UPDATE horarios_personal SET activo = 1 WHERE id = ?', [id]))
        .rejects.toThrow();
      await db.query(`UPDATE horarios_personal SET sucursal_id = ?,
        fin_minutos = 1440, activo = 1 WHERE id = ?`, [sucursalId, id]);
      expect((await db.query('SELECT fin_minutos FROM horarios_personal WHERE id = ?',
        [id]))[0].fin_minutos).toBe(1440);
      await expect(db.query('UPDATE horarios_personal SET inicio_minutos = 1440 WHERE id = ?',
        [id])).rejects.toThrow();
      await expect(db.query('UPDATE horarios_personal SET descanso_inicio_minutos = 600 WHERE id = ?',
        [id])).rejects.toThrow();
      await expect(db.query('UPDATE horarios_personal SET sucursal_id = ? WHERE id = ?',
        [ajenaId, id])).rejects.toThrow();
      await db.query('UPDATE horarios_personal SET activo = 0, fin_minutos = NULL WHERE id = ?', [id]);
      expect((await db.query('SELECT fin_minutos FROM horarios_personal WHERE id = ?',
        [id]))[0].fin_minutos).toBeNull();
      expect((await db.query('SELECT COUNT(*) total FROM horarios_personal WHERE id = ?',
        [id]))[0].total).toBe('1');
    });
  });

  it('rechaza asignación ajena incluso en borrador y perfil de otro negocio', async () => {
    await conBaseMigrada(async (db) => {
      const { negocioId, personalId, ajenaId } = await datos(db);
      await expect(db.query(`INSERT INTO horarios_personal
        (negocio_id,personal_id,dia_semana,orden,activo,sucursal_id)
        VALUES (?,?,2,0,0,?)`, [negocioId, personalId, ajenaId])).rejects.toThrow();
      await expect(db.query(`INSERT INTO horarios_personal
        (negocio_id,personal_id,dia_semana,orden,activo)
        VALUES (?,?,2,0,0)`, [negocioId + 1, personalId])).rejects.toThrow();
    });
  });

  it('distingue excepción vacía, impide duplicados y conserva franjas hijas', async () => {
    await conBaseMigrada(async (db) => {
      const { negocioId, personalId, sucursalId } = await datos(db);
      const fecha = '2026-10-15';
      const vacia = await db.query(`INSERT INTO excepciones_horario
        (negocio_id,personal_id,sucursal_id,fecha_local) VALUES (?,?,?,?)`,
      [negocioId, personalId, sucursalId, fecha]);
      const id = Number(vacia.insertId);
      const antes = await db.query(`SELECT e.id, COUNT(f.id) AS franjas FROM excepciones_horario e
        LEFT JOIN franjas_excepcion_horario f ON f.excepcion_id = e.id
        WHERE e.id = ? GROUP BY e.id`, [id]);
      expect(antes).toHaveLength(1);
      expect(Number(antes[0].franjas)).toBe(0);
      expect(await db.query(`SELECT id FROM excepciones_horario WHERE fecha_local = '2026-10-16'`))
        .toEqual([]);
      await expect(db.query(`INSERT INTO excepciones_horario
        (negocio_id,personal_id,sucursal_id,fecha_local) VALUES (?,?,?,?)`,
      [negocioId, personalId, sucursalId, fecha])).rejects.toThrow();
      await db.query(`INSERT INTO franjas_excepcion_horario
        (negocio_id,excepcion_id,orden,inicio_minutos,fin_minutos)
        VALUES (?,?,0,1320,1440)`, [negocioId, id]);
      await expect(db.query(`INSERT INTO franjas_excepcion_horario
        (negocio_id,excepcion_id,orden,inicio_minutos,fin_minutos)
        VALUES (?,?,1,600,700)`, [negocioId + 1, id])).rejects.toThrow();
      const despues = await db.query(`SELECT COUNT(*) total FROM franjas_excepcion_horario
        WHERE excepcion_id = ?`, [id]);
      expect(Number(despues[0].total)).toBe(1);
    });
  });
});
