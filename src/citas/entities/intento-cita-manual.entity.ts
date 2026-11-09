import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne,
  PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Negocio } from '../../negocios/entities/negocio.entity';
import { Usuario } from '../../usuarios/entities/usuario.entity';
import { Cita } from '../../disponibilidad/entities/cita.entity';

export type EstadoIntentoCitaManual = 'preparado' | 'registrado' | 'no_registrado';

/** Persistencia del envío manual: identidad por cuenta y negocio, sin formulario ni contacto. */
@Entity({ name: 'intentos_cita_manual' })
@Index('uq_icm_negocio_id', ['negocioId', 'id'], { unique: true })
@Index('uq_icm_actor_clave', ['negocioId', 'actorUsuarioId', 'clave'], { unique: true })
@Index('uq_icm_cita', ['negocioId', 'citaId'], { unique: true })
@Index('idx_icm_actor_estado_fecha', ['negocioId', 'actorUsuarioId', 'estado', 'creadoEn', 'id'])
@Check('chk_icm_clave', 'CHAR_LENGTH(clave) BETWEEN 16 AND 64 AND BINARY clave = BINARY TRIM(clave)')
@Check('chk_icm_hash', "contenido_hash REGEXP '^[0-9a-f]{64}$'")
@Check('chk_icm_resultado', "(estado='preparado' AND cita_id IS NULL AND resuelto_en IS NULL) OR (estado='registrado' AND cita_id IS NOT NULL AND resuelto_en IS NOT NULL) OR (estado='no_registrado' AND cita_id IS NULL AND resuelto_en IS NOT NULL)")
export class IntentoCitaManual {
  // BIGINT se representa como cadena para conservar todos sus dígitos.
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ name: 'negocio_id', type: 'int', unsigned: true })
  negocioId: number;

  @Column({ name: 'actor_usuario_id', type: 'int', unsigned: true })
  actorUsuarioId: number;

  @Column({ type: 'varchar', length: 64, charset: 'ascii', collation: 'ascii_bin' })
  clave: string;

  @Column({ name: 'contenido_hash', type: 'char', length: 64, charset: 'ascii', collation: 'ascii_bin' })
  contenidoHash: string;

  @Column({ type: 'enum', enum: ['preparado', 'registrado', 'no_registrado'], default: 'preparado' })
  estado: EstadoIntentoCitaManual;

  @Column({ name: 'cita_id', type: 'int', unsigned: true, nullable: true })
  citaId: number | null;

  // Las referencias compuestas impiden asignar un actor o resultado de otro negocio.
  @ManyToOne(() => Negocio, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'negocio_id', referencedColumnName: 'id', foreignKeyConstraintName: 'fk_icm_negocio' })
  negocio: Negocio;

  @ManyToOne(() => Usuario, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn([{ name: 'negocio_id', referencedColumnName: 'negocioId', foreignKeyConstraintName: 'fk_icm_actor' },
    { name: 'actor_usuario_id', referencedColumnName: 'id' }])
  actor: Usuario;

  @ManyToOne(() => Cita, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn([{ name: 'negocio_id', referencedColumnName: 'negocioId', foreignKeyConstraintName: 'fk_icm_cita' },
    { name: 'cita_id', referencedColumnName: 'id' }])
  cita: Cita | null;

  @CreateDateColumn({ name: 'creado_en', type: 'datetime', precision: 6 })
  creadoEn: Date;

  @UpdateDateColumn({ name: 'actualizado_en', type: 'datetime', precision: 6 })
  actualizadoEn: Date;

  @Column({ name: 'resuelto_en', type: 'datetime', precision: 6, nullable: true })
  resueltoEn: Date | null;
}
