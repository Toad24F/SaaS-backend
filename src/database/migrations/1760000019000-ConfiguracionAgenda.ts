import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Una configuración por negocio; leer valores iniciales no exige crear la fila. */
export class ConfiguracionAgenda1760000019000 implements MigrationInterface {
  name = 'ConfiguracionAgenda1760000019000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // La PK por negocio evita configuraciones duplicadas aun en escrituras simultáneas.
    await queryRunner.query(`CREATE TABLE configuracion_agenda (
      negocio_id INT UNSIGNED NOT NULL,
      modo VARCHAR(20) NOT NULL DEFAULT 'ventana_libre',
      intervalo_minutos INT UNSIGNED NOT NULL DEFAULT 15,
      anticipacion_minutos INT UNSIGNED NOT NULL DEFAULT 15,
      dias_futuros INT UNSIGNED NOT NULL DEFAULT 60,
      creado_en DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      actualizado_en DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
        ON UPDATE CURRENT_TIMESTAMP(6),
      PRIMARY KEY (negocio_id),
      CONSTRAINT fk_configuracion_agenda_negocio FOREIGN KEY (negocio_id)
        REFERENCES negocios(id) ON DELETE RESTRICT,
      CONSTRAINT chk_agenda_modo CHECK (modo IN ('ventana_libre','agenda_compacta')),
      CONSTRAINT chk_agenda_intervalo CHECK (intervalo_minutos IN (5,10,15,20,30,60)),
      CONSTRAINT chk_agenda_anticipacion CHECK (anticipacion_minutos MOD 5 = 0)
    ) ENGINE=InnoDB`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE configuracion_agenda');
  }
}
