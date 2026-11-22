import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Un remitente por negocio; la base conserva solo la ubicación del secreto externo. */
export class CanalesWhatsapp1760000058000 implements MigrationInterface {
  name = 'CanalesWhatsapp1760000058000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE canales_whatsapp (
      negocio_id INT UNSIGNED NOT NULL,
      remitente_externo_id VARCHAR(100) NOT NULL,
      secreto_ref VARCHAR(200) NOT NULL,
      version INT UNSIGNED NOT NULL DEFAULT 1,
      habilitado TINYINT(1) NOT NULL DEFAULT 0,
      creado_en DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      actualizado_en DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
      PRIMARY KEY (negocio_id),
      UNIQUE KEY uq_cw_remitente (remitente_externo_id),
      CONSTRAINT fk_cw_negocio FOREIGN KEY (negocio_id) REFERENCES negocios(id) ON DELETE RESTRICT,
      CONSTRAINT chk_cw_remitente CHECK (CHAR_LENGTH(TRIM(remitente_externo_id)) > 0),
      CONSTRAINT chk_cw_secreto_ref CHECK (secreto_ref REGEXP '^secret://[A-Za-z0-9/_-]+$'),
      CONSTRAINT chk_cw_version CHECK (version >= 1),
      CONSTRAINT chk_cw_habilitado CHECK (habilitado IN (0,1))
    ) ENGINE=InnoDB`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const [uso] = await queryRunner.query('SELECT COUNT(*) total FROM canales_whatsapp');
    if (Number(uso.total)) throw new Error('No se puede retirar un canal WhatsApp configurado.');
    await queryRunner.query('DROP TABLE canales_whatsapp');
  }
}
