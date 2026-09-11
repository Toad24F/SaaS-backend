import type { MigrationInterface, QueryRunner } from 'typeorm';

/** T18: auditoría con pertenencia reforzada y contador único por IP. */
export class CrearAuditoriaLimites1760000003000 implements MigrationInterface {
  name = 'CrearAuditoriaLimites1760000003000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE eventos_auditoria (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        operacion_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
        actor_usuario_id INT UNSIGNED NOT NULL,
        negocio_id INT UNSIGNED NULL,
        usuario_id INT UNSIGNED NULL,
        licencia_id INT UNSIGNED NULL,
        accion VARCHAR(64) NOT NULL,
        ocurrido_en DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        valores_antes JSON NULL,
        valores_despues JSON NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uq_auditoria_operacion (operacion_id),
        INDEX idx_auditoria_negocio_fecha (negocio_id, ocurrido_en),
        INDEX idx_auditoria_actor_fecha (actor_usuario_id, ocurrido_en),
        CONSTRAINT fk_auditoria_actor FOREIGN KEY (actor_usuario_id)
          REFERENCES usuarios(id),
        CONSTRAINT fk_auditoria_negocio FOREIGN KEY (negocio_id)
          REFERENCES negocios(id),
        CONSTRAINT fk_auditoria_usuario FOREIGN KEY (negocio_id, usuario_id)
          REFERENCES usuarios(negocio_id, id),
        CONSTRAINT fk_auditoria_licencia FOREIGN KEY (negocio_id, licencia_id)
          REFERENCES licencias(negocio_id, id),
        CONSTRAINT chk_auditoria_destino CHECK (
          (usuario_id IS NULL AND licencia_id IS NULL) OR negocio_id IS NOT NULL
        ),
        CONSTRAINT chk_auditoria_accion CHECK (
          CHAR_LENGTH(TRIM(accion)) > 0
        )
      ) ENGINE=InnoDB
    `);
    await queryRunner.query(`
      CREATE TABLE limites_intentos (
        origen VARCHAR(45) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
        ventana_inicio DATETIME(6) NOT NULL,
        intentos INT UNSIGNED NOT NULL DEFAULT 0,
        bloqueado_hasta DATETIME(6) NULL,
        PRIMARY KEY (origen),
        INDEX idx_limites_ventana (ventana_inicio),
        INDEX idx_limites_bloqueo (bloqueado_hasta),
        CONSTRAINT chk_limites_origen CHECK (
          CHAR_LENGTH(TRIM(origen)) > 0
        ),
        CONSTRAINT chk_limites_bloqueo CHECK (
          bloqueado_hasta IS NULL OR bloqueado_hasta >= ventana_inicio
        )
      ) ENGINE=InnoDB
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE limites_intentos');
    await queryRunner.query('DROP TABLE eventos_auditoria');
  }
}
