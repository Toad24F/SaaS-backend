import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Identifica cada envío manual por actor y clave, conservando solo su huella. */
export class IntentosCitaManual1760000045000 implements MigrationInterface {
  name = 'IntentosCitaManual1760000045000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Las FKs e índices de consulta se completan en ReferenciasGestionOperativa.
    await queryRunner.query(`CREATE TABLE intentos_cita_manual (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      negocio_id INT UNSIGNED NOT NULL,
      actor_usuario_id INT UNSIGNED NOT NULL,
      clave VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      contenido_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      estado ENUM('preparado','registrado','no_registrado') NOT NULL DEFAULT 'preparado',
      cita_id INT UNSIGNED NULL,
      creado_en DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      actualizado_en DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
        ON UPDATE CURRENT_TIMESTAMP(6),
      resuelto_en DATETIME(6) NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_icm_negocio_id (negocio_id,id),
      UNIQUE KEY uq_icm_actor_clave (negocio_id,actor_usuario_id,clave),
      UNIQUE KEY uq_icm_cita (negocio_id,cita_id),
      CONSTRAINT chk_icm_clave CHECK (
        CHAR_LENGTH(clave) BETWEEN 16 AND 64 AND BINARY clave = BINARY TRIM(clave)),
      CONSTRAINT chk_icm_hash CHECK (contenido_hash REGEXP '^[0-9a-f]{64}$'),
      CONSTRAINT chk_icm_resultado CHECK (
        (estado='preparado' AND cita_id IS NULL AND resuelto_en IS NULL)
        OR (estado='registrado' AND cita_id IS NOT NULL AND resuelto_en IS NOT NULL)
        OR (estado='no_registrado' AND cita_id IS NULL AND resuelto_en IS NOT NULL))
    ) ENGINE=InnoDB`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Un intento terminal también es información durable; no se borra al revertir.
    const [uso] = await queryRunner.query('SELECT COUNT(*) total FROM intentos_cita_manual');
    if (Number(uso.total) > 0) throw new Error('No se pueden retirar intentos manuales sin perder datos.');
    await queryRunner.query('DROP TABLE intentos_cita_manual');
  }
}
