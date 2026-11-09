import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Aísla intentos e historial por negocio y acota las consultas operativas futuras. */
export class ReferenciasGestionOperativa1760000048000 implements MigrationInterface {
  name = 'ReferenciasGestionOperativa1760000048000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // El actor es una cuenta del negocio (Administración/Recepción), no exige perfil Profesional.
    await queryRunner.query(`ALTER TABLE intentos_cita_manual
      ADD INDEX idx_icm_actor_estado_fecha (negocio_id,actor_usuario_id,estado,creado_en,id),
      ADD CONSTRAINT fk_icm_negocio FOREIGN KEY (negocio_id)
        REFERENCES negocios(id) ON DELETE RESTRICT,
      ADD CONSTRAINT fk_icm_actor FOREIGN KEY (negocio_id,actor_usuario_id)
        REFERENCES usuarios(negocio_id,id) ON DELETE RESTRICT,
      ADD CONSTRAINT fk_icm_cita FOREIGN KEY (negocio_id,cita_id)
        REFERENCES citas(negocio_id,id) ON DELETE RESTRICT`);
    await queryRunner.query(`ALTER TABLE eventos_cita
      ADD INDEX idx_ec_cita_fecha (negocio_id,cita_id,ocurrido_en,id),
      ADD INDEX idx_ec_actor_fecha (negocio_id,actor_usuario_id,ocurrido_en),
      ADD INDEX idx_ec_sesion (negocio_id,sesion_publica_id),
      ADD CONSTRAINT fk_ec_negocio FOREIGN KEY (negocio_id)
        REFERENCES negocios(id) ON DELETE RESTRICT,
      ADD CONSTRAINT fk_ec_cita FOREIGN KEY (negocio_id,cita_id)
        REFERENCES citas(negocio_id,id) ON DELETE RESTRICT,
      ADD CONSTRAINT fk_ec_actor FOREIGN KEY (negocio_id,actor_usuario_id)
        REFERENCES usuarios(negocio_id,id) ON DELETE RESTRICT,
      ADD CONSTRAINT fk_ec_sesion FOREIGN KEY (negocio_id,sesion_publica_id)
        REFERENCES sesiones_reserva_publica(negocio_id,id) ON DELETE RESTRICT`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // No dejar filas operativas sin su aislamiento por negocio al retroceder.
    const [intentos] = await queryRunner.query('SELECT COUNT(*) total FROM intentos_cita_manual');
    const [eventos] = await queryRunner.query('SELECT COUNT(*) total FROM eventos_cita');
    if (Number(intentos.total) > 0 || Number(eventos.total) > 0) {
      throw new Error('No se pueden retirar las referencias operativas sin perder garantías de pertenencia.');
    }
    // En una instalación sin uso se retiran los arcos antes que sus tablas.
    await queryRunner.query(`ALTER TABLE eventos_cita
      DROP FOREIGN KEY fk_ec_sesion, DROP FOREIGN KEY fk_ec_actor,
      DROP FOREIGN KEY fk_ec_cita, DROP FOREIGN KEY fk_ec_negocio,
      DROP INDEX idx_ec_sesion, DROP INDEX idx_ec_actor_fecha, DROP INDEX idx_ec_cita_fecha`);
    await queryRunner.query(`ALTER TABLE intentos_cita_manual
      DROP FOREIGN KEY fk_icm_cita, DROP FOREIGN KEY fk_icm_actor, DROP FOREIGN KEY fk_icm_negocio,
      DROP INDEX idx_icm_actor_estado_fecha`);
  }
}
