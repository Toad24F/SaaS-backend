import { conBaseMigrada } from './support/mariadb';
import { crearEscenarioOperativo } from './support/operacion-fase-5';
import { RelojPrueba } from './support/reloj';
import { Cita } from '../src/disponibilidad/entities/cita.entity';

describe('M5-T126–T128: actualización conservadora desde citas con folio', () => {
  it('limpia solo la clave JSON, conserva vínculos e impide alterar eventos después', async () => {
    await conBaseMigrada(async db => {
      const { negocios: [negocio] } = await crearEscenarioOperativo(db, new RelojPrueba(new Date('2026-11-24T12:00:00Z')));
      const citaId = negocio.ocupaciones[0];
      const anterior = (await db.query('SELECT * FROM citas WHERE id=?', [citaId]))[0];
      const evento = await db.query(`INSERT INTO eventos_cita
        (negocio_id,cita_id,actor_usuario_id,accion,version_resultante,valores_antes,valores_despues)
        VALUES (?,?,?,'alta',1,?,?)`, [negocio.id, citaId, negocio.profesionales[0],
        JSON.stringify({ folio: anterior.folio, estado: 'pendiente', marca: 'antes' }),
        JSON.stringify({ folio: anterior.folio, estado: 'confirmada', marca: 'despues' })]);
      // El intento anterior mantiene su clave, huella y vínculo a la cita durante la actualización.
      const huella = 'a'.repeat(64);
      const intento = await db.query(`INSERT INTO intentos_cita_manual
        (negocio_id,actor_usuario_id,clave,contenido_hash,estado,cita_id,resuelto_en)
        VALUES (?,?,?,?,'registrado',?,?)`,
      [negocio.id, negocio.profesionales[0], 'intento_previo_123456', huella, citaId,
        new Date('2026-11-24T12:00:00Z')]);
      const migraciones = await db.runMigrations({ transaction: 'each' });
      expect(migraciones.map(migracion => migracion.name)).toEqual([
        'LimpiezaFolioEventos1760000067000', 'RetiradaFolioCitas1760000068000',
      ]);

      const nueva = (await db.query('SELECT * FROM citas WHERE id=?', [citaId]))[0];
      const { folio: _anterior, ...sinFolio } = anterior;
      expect(nueva).toEqual(sinFolio);
      expect(nueva.cliente_id).toBe(anterior.cliente_id);
      const [guardado] = await db.query('SELECT * FROM eventos_cita WHERE id=?', [evento.insertId]);
      expect(guardado.valores_antes).toEqual({ estado: 'pendiente', marca: 'antes' });
      expect(guardado.valores_despues).toEqual({ estado: 'confirmada', marca: 'despues' });
      expect(guardado.cita_id).toBe(citaId);
      expect((await db.query('SELECT cita_id,contenido_hash,clave FROM intentos_cita_manual WHERE id=?', [intento.insertId]))[0])
        .toEqual({ cita_id: citaId, contenido_hash: huella, clave: 'intento_previo_123456' });
      // La misma consulta acotada por negocio, actor y clave recupera la cita antigua sin campo visible.
      const recuperar = () => db.query(`SELECT c.id,c.cliente_id,c.estado FROM intentos_cita_manual i
        JOIN citas c ON c.id=i.cita_id AND c.negocio_id=i.negocio_id
        WHERE i.negocio_id=? AND i.actor_usuario_id=? AND i.clave=? AND i.contenido_hash=?`,
      [negocio.id, negocio.profesionales[0], 'intento_previo_123456', huella]);
      expect(await recuperar()).toEqual([{ id: citaId, cliente_id: anterior.cliente_id, estado: anterior.estado }]);
      expect(await recuperar()).toEqual([{ id: citaId, cliente_id: anterior.cliente_id, estado: anterior.estado }]);
      await expect(db.query('UPDATE eventos_cita SET motivo=? WHERE id=?', ['alterado', evento.insertId])).rejects.toThrow();
      await expect(db.query('DELETE FROM eventos_cita WHERE id=?', [evento.insertId])).rejects.toThrow();
      expect((await db.query("SHOW COLUMNS FROM citas LIKE 'folio'")).length).toBe(0);
      expect((await db.query("SHOW INDEX FROM citas WHERE Key_name='uq_citas_folio'")).length).toBe(0);
      expect(db.getMetadata(Cita).columns.some(columna => columna.databaseName === 'folio')).toBe(false);
    }, 'citas_m4_test', 'CortesReporte1760000066000');
  });
});
