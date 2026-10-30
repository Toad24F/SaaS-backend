import { conBaseMigrada } from './support/mariadb';
import { crearEscenarioPortal } from './support/escenario-portal';
import { RelojPrueba } from './support/reloj';

describe('ALA-T019–T022: migrar separación y extremos protegidos', () => {
  it('conserva configuración y extremos previos sin inventar contexto de apartados', async () => {
    await conBaseMigrada(async (db) => {
      const nuevas = ['SeparacionAgenda1760000039000', 'ExtremosProtegidos1760000040000'];
      expect(nuevas.every((nombre) => db.migrations.some((m) => m.name === nombre))).toBe(true);
      // Prepara datos con el esquema anterior y luego ejecuta solo las migraciones nuevas.
      await db.undoLastMigration();
      await db.undoLastMigration();
      const escenario = await crearEscenarioPortal(db,
        new RelojPrueba(new Date('2026-10-20T12:00:00Z')));
      const negocio = escenario.negocios[0].id;
      await db.query(`INSERT INTO configuracion_agenda
        (negocio_id,modo,intervalo_minutos,anticipacion_minutos,dias_futuros)
        VALUES (?,'agenda_compacta',30,20,90)`, [negocio]);
      const citaId = escenario.negocios[0].ocupaciones[0];
      const apartadoId = escenario.negocios[0].ocupaciones[1];
      const [citaAntes] = await db.query('SELECT inicio_utc,fin_utc FROM citas WHERE id=?', [citaId]);
      const [apartadoAntes] = await db.query('SELECT inicio_utc,fin_utc,expira_en FROM bloqueos_temporales WHERE id=?', [apartadoId]);
      await db.runMigrations({ transaction: 'each' });
      const [config] = await db.query(`SELECT modo,intervalo_minutos,anticipacion_minutos,
        dias_futuros,tiempo_entre_citas_minutos FROM configuracion_agenda WHERE negocio_id=?`, [negocio]);
      expect(config).toMatchObject({ modo: 'agenda_compacta', intervalo_minutos: 30,
        anticipacion_minutos: 20, dias_futuros: 90, tiempo_entre_citas_minutos: 0 });
      const [cita] = await db.query(`SELECT inicio_utc,fin_utc,fin_ocupacion_utc,
        separacion_minutos FROM citas WHERE id=?`, [citaId]);
      expect(cita.inicio_utc.getTime()).toBe(citaAntes.inicio_utc.getTime());
      expect(cita.fin_utc.getTime()).toBe(citaAntes.fin_utc.getTime());
      expect(cita.fin_ocupacion_utc.getTime()).toBe(cita.fin_utc.getTime());
      expect(cita.separacion_minutos).toBe(0);
      const [apartado] = await db.query(`SELECT inicio_utc,fin_utc,expira_en,
        fin_ocupacion_utc,separacion_minutos,modo_concesion,version_reglas
        FROM bloqueos_temporales WHERE id=?`, [apartadoId]);
      for (const campo of ['inicio_utc', 'fin_utc', 'expira_en']) {
        expect(apartado[campo].getTime()).toBe(apartadoAntes[campo].getTime());
      }
      for (const campo of ['fin_ocupacion_utc', 'separacion_minutos',
        'modo_concesion', 'version_reglas']) expect(apartado[campo]).toBeNull();
    });
  });

  it('admite separación 0/5/60 y exige un fin protegido exacto, sin redondeo', async () => {
    await conBaseMigrada(async (db) => {
      const escenario = await crearEscenarioPortal(db,
        new RelojPrueba(new Date('2026-10-20T12:00:00Z')));
      const negocio = escenario.negocios[0].id;
      await db.query('INSERT INTO configuracion_agenda (negocio_id) VALUES (?)', [negocio]);
      for (const separacion of [0, 5, 60]) {
        await db.query('UPDATE configuracion_agenda SET tiempo_entre_citas_minutos=? WHERE negocio_id=?',
          [separacion, negocio]);
      }
      for (const separacion of [-5, 7, 65]) {
        await expect(db.query('UPDATE configuracion_agenda SET tiempo_entre_citas_minutos=? WHERE negocio_id=?',
          [separacion, negocio])).rejects.toBeDefined();
      }
      const citaId = escenario.negocios[0].ocupaciones[0];
      const apartadoId = escenario.negocios[0].ocupaciones[1];
      await db.query(`UPDATE citas SET separacion_minutos=5,
        fin_ocupacion_utc=DATE_ADD(fin_utc, INTERVAL 5 MINUTE) WHERE id=?`, [citaId]);
      await expect(db.query(`UPDATE citas SET
        fin_ocupacion_utc=DATE_ADD(fin_utc, INTERVAL 10 MINUTE) WHERE id=?`, [citaId]))
        .rejects.toBeDefined();
      await db.query(`UPDATE bloqueos_temporales SET separacion_minutos=5,
        fin_ocupacion_utc=DATE_ADD(fin_utc, INTERVAL 5 MINUTE),
        modo_concesion='agenda_compacta',version_reglas=1 WHERE id=?`, [apartadoId]);
      await expect(db.query(`UPDATE bloqueos_temporales SET
        fin_ocupacion_utc=DATE_ADD(fin_utc, INTERVAL 10 MINUTE) WHERE id=?`, [apartadoId]))
        .rejects.toBeDefined();
      await expect(db.query('UPDATE bloqueos_temporales SET modo_concesion=NULL WHERE id=?',
        [apartadoId])).rejects.toBeDefined();
    });
  });
});
