import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Amplía la lista cerrada de destinos sin relajar referencias incompletas. */
export class AuditoriaClientes1760000047000 implements MigrationInterface {
  name = 'AuditoriaClientes1760000047000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // IS NOT NULL evita que la lógica ternaria de SQL acepte un tipo nulo con ID.
    await queryRunner.query(`ALTER TABLE eventos_auditoria
      DROP CONSTRAINT chk_auditoria_recurso,
      ADD CONSTRAINT chk_auditoria_recurso CHECK (
        (recurso_tipo IS NULL AND recurso_id IS NULL)
        OR (recurso_tipo IS NOT NULL
          AND recurso_tipo IN ('sucursal','servicio','profesional','horario','bloqueo','cliente')
          AND recurso_id IS NOT NULL AND recurso_id > 0))`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const [uso] = await queryRunner.query("SELECT COUNT(*) total FROM eventos_auditoria WHERE recurso_tipo='cliente'");
    if (Number(uso.total) > 0) throw new Error('No se puede retirar la auditoría de clientes sin perder datos.');
    // Se restituye exactamente la restricción anterior, sin alterar eventos existentes.
    await queryRunner.query(`ALTER TABLE eventos_auditoria
      DROP CONSTRAINT chk_auditoria_recurso,
      ADD CONSTRAINT chk_auditoria_recurso CHECK (
        (recurso_tipo IS NULL AND recurso_id IS NULL)
        OR (recurso_tipo IN ('sucursal','servicio','profesional','horario','bloqueo')
          AND recurso_id IS NOT NULL AND recurso_id > 0))`);
  }
}
