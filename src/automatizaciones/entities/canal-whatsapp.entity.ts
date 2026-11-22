import { Check, Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/** La referencia apunta al gestor externo; nunca se guarda aquí el token de Meta. */
@Entity({ name: 'canales_whatsapp' })
@Index('uq_cw_remitente', ['remitenteExternoId'], { unique: true })
@Check('chk_cw_remitente', 'CHAR_LENGTH(TRIM(remitente_externo_id)) > 0')
@Check('chk_cw_secreto_ref', "secreto_ref REGEXP '^secret://[A-Za-z0-9/_-]+$'")
@Check('chk_cw_version', 'version >= 1')
@Check('chk_cw_habilitado', 'habilitado IN (0,1)')
export class CanalWhatsapp {
  @PrimaryColumn({ name: 'negocio_id', type: 'int', unsigned: true }) negocioId: number;
  @Column({ name: 'remitente_externo_id', type: 'varchar', length: 100 }) remitenteExternoId: string;
  @Column({ name: 'secreto_ref', type: 'varchar', length: 200 }) secretoRef: string;
  @Column({ type: 'int', unsigned: true, default: 1 }) version: number;
  @Column({ type: 'tinyint', default: 0 }) habilitado: number;
  @CreateDateColumn({ name: 'creado_en', type: 'datetime', precision: 6 }) creadoEn: Date;
  @UpdateDateColumn({ name: 'actualizado_en', type: 'datetime', precision: 6 }) actualizadoEn: Date;
}
