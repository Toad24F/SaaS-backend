import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Limpia exclusivamente la clave antigua del historial y repone la barrera de inmutabilidad. */
export class LimpiezaFolioEventos1760000067000 implements MigrationInterface {
  name = 'LimpiezaFolioEventos1760000067000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Los triggers bloquean UPDATE ordinario. El privilegio de migración los retira
    // durante esta transformación acotada y los restablece aun si falla el UPDATE.
    const restaurar = async (nombre: string, definicion: string) => {
      const [fila] = await queryRunner.query(`SELECT COUNT(*) total FROM information_schema.TRIGGERS
        WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME=?`, [nombre]);
      if (Number(fila?.total ?? 0) === 0) await queryRunner.query(definicion);
    };
    try {
      await queryRunner.query('DROP TRIGGER trg_ec_no_actualizar');
      await queryRunner.query('DROP TRIGGER trg_ec_no_borrar');
      await queryRunner.query(`UPDATE eventos_cita SET
        valores_antes = CASE WHEN valores_antes IS NULL THEN NULL
          ELSE JSON_REMOVE(valores_antes, '$.folio') END,
        valores_despues = JSON_REMOVE(valores_despues, '$.folio')
        WHERE (valores_antes IS NOT NULL AND JSON_CONTAINS_PATH(valores_antes, 'one', '$.folio'))
          OR JSON_CONTAINS_PATH(valores_despues, 'one', '$.folio')`);
    } finally {
      await restaurar('trg_ec_no_actualizar', `CREATE TRIGGER trg_ec_no_actualizar BEFORE UPDATE ON eventos_cita
        FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='El historial de citas es inmutable.'`);
      await restaurar('trg_ec_no_borrar', `CREATE TRIGGER trg_ec_no_borrar BEFORE DELETE ON eventos_cita
        FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='El historial de citas es inmutable.'`);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // No es posible reponer el JSON de eventos reales; el caso vacío solo retrocede la versión.
    const [uso] = await queryRunner.query('SELECT COUNT(*) total FROM eventos_cita');
    if (Number(uso.total) > 0) throw new Error('La limpieza del historial requiere una corrección hacia delante.');
  }
}
