import { conBaseOperativa, crearEscenarioOperativo } from './support/operacion-fase-5';
import { retrocederHastaMigracion } from './support/mariadb';
import { RelojPrueba } from './support/reloj';

describe('M5-T072: actualización de citas heredadas', () => {
  it('clasifica citas previas como manual_heredada sin plazos ni envíos', async () => {
    await conBaseOperativa(async (db) => {
      await retrocederHastaMigracion(db, 'ConfiguracionAutomatizaciones1760000054000');
      const { negocios: [negocio] } = await crearEscenarioOperativo(db,
        new RelojPrueba(new Date('2026-11-22T12:00:00.000Z')));
      const citasAntes = await db.query('SELECT id,estado,inicio_utc FROM citas WHERE negocio_id=? ORDER BY id', [negocio.id]);
      const aplicadas = await db.runMigrations({ transaction: 'each' });
      expect(aplicadas.map(migracion => migracion.name)).toContain('AutorizacionWhatsappCita1760000062000');
      expect(aplicadas.map(migracion => migracion.name)).toContain('CondicionesHeredadas1760000063000');
      expect(await db.query('SELECT id,estado,inicio_utc FROM citas WHERE negocio_id=? ORDER BY id', [negocio.id]))
        .toEqual(citasAntes);
      const condiciones = await db.query('SELECT * FROM condiciones_confirmacion_cita WHERE negocio_id=? ORDER BY cita_id', [negocio.id]);
      expect(condiciones).toHaveLength(citasAntes.length);
      expect(condiciones.every((condicion: { categoria: string; vencimiento_utc: Date | null; contacto_autorizado: number }) =>
        condicion.categoria === 'manual_heredada' && condicion.vencimiento_utc === null && condicion.contacto_autorizado === 0)).toBe(true);
      expect(await db.query('SELECT id FROM envios_whatsapp')).toHaveLength(0);
      const vinculadas = await db.query('SELECT id,generacion_automatizacion,condicion_vigente_id FROM citas WHERE negocio_id=? ORDER BY id', [negocio.id]);
      expect(vinculadas.every((cita: { id: number; generacion_automatizacion: number; condicion_vigente_id: string }) =>
        cita.generacion_automatizacion === 1 && condiciones.some((condicion: { cita_id: number; id: string }) =>
          condicion.cita_id === cita.id && String(condicion.id) === String(cita.condicion_vigente_id)))).toBe(true);
    });
  });
});
