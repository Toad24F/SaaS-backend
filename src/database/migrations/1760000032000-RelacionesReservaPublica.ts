import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Cierra referencias compuestas del portal después de crear todas sus tablas. */
export class RelacionesReservaPublica1760000032000 implements MigrationInterface {
  name = 'RelacionesReservaPublica1760000032000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // La sesión nace sin apartado; el puntero se rellena tras concederlo.
    await queryRunner.query(`ALTER TABLE sesiones_reserva_publica
      ADD CONSTRAINT fk_srp_apartado FOREIGN KEY (negocio_id, apartado_actual_id)
        REFERENCES bloqueos_temporales(negocio_id, id) ON DELETE RESTRICT`);
    // La selección y el resultado siempre pertenecen al negocio de la operación.
    await queryRunner.query(`ALTER TABLE operaciones_apartado
      ADD CONSTRAINT fk_oa_personal FOREIGN KEY (negocio_id, personal_id)
        REFERENCES personal(negocio_id, id) ON DELETE RESTRICT,
      ADD CONSTRAINT fk_oa_sucursal FOREIGN KEY (negocio_id, sucursal_id)
        REFERENCES sucursales(negocio_id, id) ON DELETE RESTRICT,
      ADD CONSTRAINT fk_oa_servicio FOREIGN KEY (negocio_id, servicio_id)
        REFERENCES servicios(negocio_id, id) ON DELETE RESTRICT,
      ADD CONSTRAINT fk_oa_apartado FOREIGN KEY (negocio_id, apartado_id)
        REFERENCES bloqueos_temporales(negocio_id, id) ON DELETE RESTRICT`);
    // Las filas históricas tienen NULL y siguen siendo válidas sin contexto público.
    await queryRunner.query(`ALTER TABLE bloqueos_temporales
      ADD CONSTRAINT fk_bt_sesion FOREIGN KEY (negocio_id, sesion_id)
        REFERENCES sesiones_reserva_publica(negocio_id, id) ON DELETE RESTRICT,
      ADD CONSTRAINT fk_bt_operacion FOREIGN KEY (negocio_id, operacion_id)
        REFERENCES operaciones_apartado(negocio_id, id) ON DELETE RESTRICT`);
    // Una cita confirmada nunca se borra en cascada al tocar un intento.
    await queryRunner.query(`ALTER TABLE intentos_reserva_publica
      ADD CONSTRAINT fk_irp_apartado FOREIGN KEY (negocio_id, apartado_id)
        REFERENCES bloqueos_temporales(negocio_id, id) ON DELETE RESTRICT,
      ADD CONSTRAINT fk_irp_cita FOREIGN KEY (negocio_id, cita_id)
        REFERENCES citas(negocio_id, id) ON DELETE RESTRICT`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Soltar primero los arcos hacia el ciclo permite revertir después las tablas.
    await queryRunner.query(`ALTER TABLE intentos_reserva_publica
      DROP FOREIGN KEY fk_irp_cita, DROP FOREIGN KEY fk_irp_apartado`);
    await queryRunner.query(`ALTER TABLE bloqueos_temporales
      DROP FOREIGN KEY fk_bt_operacion, DROP FOREIGN KEY fk_bt_sesion`);
    await queryRunner.query(`ALTER TABLE operaciones_apartado
      DROP FOREIGN KEY fk_oa_apartado, DROP FOREIGN KEY fk_oa_servicio,
      DROP FOREIGN KEY fk_oa_sucursal, DROP FOREIGN KEY fk_oa_personal`);
    await queryRunner.query(`ALTER TABLE sesiones_reserva_publica
      DROP FOREIGN KEY fk_srp_apartado`);
  }
}
