import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Clasifica citas anteriores sin ofrecerles cancelación ni comunicación retroactiva. */
export class CondicionesHeredadas1760000063000 implements MigrationInterface {
  name = 'CondicionesHeredadas1760000063000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Solo filas sin generación pertenecen al legado; las altas nuevas conservan su política.
    await queryRunner.query(`INSERT INTO condiciones_confirmacion_cita
      (negocio_id,cita_id,generacion,categoria,instante_base,plazo_aplicado_minutos,
       vencimiento_utc,motivo_seguimiento,estado_politica,version_configuracion,contacto_autorizado)
      SELECT c.negocio_id,c.id,1,'manual_heredada',UTC_TIMESTAMP(3),NULL,NULL,
        'Cita heredada: seguimiento sin plazo ni mensajes automáticos.',
        CASE c.estado WHEN 'confirmada' THEN 'confirmada'
          WHEN 'cancelada' THEN 'cancelada'
          WHEN 'completada' THEN 'anulada'
          WHEN 'no_asistio' THEN 'anulada' ELSE 'seguimiento_manual' END,
        NULL,0
      FROM citas c
      WHERE c.generacion_automatizacion IS NULL AND c.condicion_vigente_id IS NULL`);
    // El vínculo compuesto se fija únicamente después de insertar la condición propia.
    await queryRunner.query(`UPDATE citas c
      JOIN condiciones_confirmacion_cita cc ON cc.negocio_id=c.negocio_id
        AND cc.cita_id=c.id AND cc.generacion=1 AND cc.categoria='manual_heredada'
      SET c.generacion_automatizacion=1,c.condicion_vigente_id=cc.id
      WHERE c.generacion_automatizacion IS NULL AND c.condicion_vigente_id IS NULL`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Las condiciones ya son historia de la cita: un downgrade no puede borrarlas en silencio.
    const [uso] = await queryRunner.query(`SELECT COUNT(*) total FROM condiciones_confirmacion_cita
      WHERE categoria='manual_heredada'`);
    if (Number(uso.total)) throw new Error('No se pueden retirar condiciones heredadas en uso.');
  }
}
