import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Extiende destinos sin exigir una cuenta para la invitación pendiente. */
export class DestinosAuditoria1760000006000 implements MigrationInterface {
  name = 'DestinosAuditoria1760000006000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE eventos_auditoria DROP CONSTRAINT chk_auditoria_destino');
    await queryRunner.query(`ALTER TABLE eventos_auditoria
      ADD COLUMN alta_administrador_id INT UNSIGNED NULL,
      ADD COLUMN recurso_tipo VARCHAR(32) NULL,
      ADD COLUMN recurso_id INT UNSIGNED NULL,
      ADD CONSTRAINT fk_auditoria_alta FOREIGN KEY (negocio_id, alta_administrador_id)
        REFERENCES altas_administrador(negocio_id, id),
      ADD CONSTRAINT chk_auditoria_destino CHECK (
        (usuario_id IS NULL AND licencia_id IS NULL AND alta_administrador_id IS NULL
          AND recurso_tipo IS NULL) OR negocio_id IS NOT NULL
      ),
      ADD CONSTRAINT chk_auditoria_recurso CHECK (
        (recurso_tipo IS NULL AND recurso_id IS NULL)
        OR (recurso_tipo IN ('sucursal','servicio','profesional','horario','bloqueo')
          AND recurso_id IS NOT NULL AND recurso_id > 0)
      )`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE eventos_auditoria
      DROP FOREIGN KEY fk_auditoria_alta,
      DROP CONSTRAINT chk_auditoria_recurso,
      DROP CONSTRAINT chk_auditoria_destino,
      DROP COLUMN recurso_id,
      DROP COLUMN recurso_tipo,
      DROP COLUMN alta_administrador_id`);
    await queryRunner.query(`ALTER TABLE eventos_auditoria ADD CONSTRAINT chk_auditoria_destino
      CHECK ((usuario_id IS NULL AND licencia_id IS NULL) OR negocio_id IS NOT NULL)`);
  }
}
