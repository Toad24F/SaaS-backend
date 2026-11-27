import { Check, Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** El token solo existe fuera de la base; aquí se conserva su hash y consumo. */
@Entity({ name: 'acciones_confirmacion' })
@Index('uq_ac_hash', ['tokenHash'], { unique: true })
@Index('uq_ac_envio', ['negocioId', 'envioId'], { unique: true })
@Index('idx_ac_generacion', ['negocioId', 'citaId', 'generacion'])
@Check('chk_ac_hash', "token_hash REGEXP '^[0-9a-f]{64}$'")
@Check('chk_ac_tipo', "tipo_envio='inicial_pendiente'")
@Check('chk_ac_vencimiento', 'expira_en > creado_en')
@Check('chk_ac_consumo', 'consumido_en IS NULL OR consumido_en >= creado_en')
export class AccionConfirmacion {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true }) id: string;
  @Column({ name: 'negocio_id', type: 'int', unsigned: true }) negocioId: number;
  @Column({ name: 'cita_id', type: 'int', unsigned: true }) citaId: number;
  @Column({ type: 'int', unsigned: true }) generacion: number;
  @Column({ name: 'tipo_envio', type: 'enum', enum: ['inicial_pendiente', 'inicial_confirmada', 'recordatorio'], default: 'inicial_pendiente' }) tipoEnvio: string;
  @Column({ name: 'envio_id', type: 'bigint', unsigned: true }) envioId: string;
  @Column({ name: 'token_hash', type: 'char', length: 64, charset: 'ascii', collation: 'ascii_bin' }) tokenHash: string;
  @Column({ name: 'expira_en', type: 'datetime', precision: 3 }) expiraEn: Date;
  @Column({ name: 'consumido_en', type: 'datetime', precision: 3, nullable: true }) consumidoEn: Date | null;
  @Column({ name: 'creado_en', type: 'datetime', precision: 3, default: () => 'CURRENT_TIMESTAMP(3)' }) creadoEn: Date;
}
