import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn,
  ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Negocio } from '../../negocios/entities/negocio.entity';
import { BloqueoTemporal } from '../../disponibilidad/entities/bloqueo-temporal.entity';

/** Identidad anónima del navegador dentro de un solo negocio, sin token utilizable. */
@Entity({ name: 'sesiones_reserva_publica' })
@Index('uq_srp_negocio_id', ['negocioId', 'id'], { unique: true })
@Index('uq_srp_negocio_hash', ['negocioId', 'titularHash'], { unique: true })
@Index('idx_srp_apartado', ['negocioId', 'apartadoActualId'])
@Check('chk_srp_hash', 'CHAR_LENGTH(titular_hash) = 64')
export class SesionReservaPublica {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @Column({ name: 'negocio_id', type: 'int', unsigned: true })
  negocioId: number;

  @ManyToOne(() => Negocio, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'negocio_id', referencedColumnName: 'id',
    foreignKeyConstraintName: 'fk_srp_negocio' })
  negocio: Negocio;

  @Column({ name: 'titular_hash', type: 'char', length: 64 })
  titularHash: string;

  // BIGINT llega como cadena para no perder precisión al incrementar generación.
  @Column({ type: 'bigint', unsigned: true, default: 0 })
  generacion: string;

  @Column({ name: 'apartado_actual_id', type: 'int', unsigned: true, nullable: true })
  apartadoActualId: number | null;

  @ManyToOne(() => BloqueoTemporal, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn([{ name: 'negocio_id', referencedColumnName: 'negocioId',
    foreignKeyConstraintName: 'fk_srp_apartado' },
  { name: 'apartado_actual_id', referencedColumnName: 'id' }])
  apartadoActual: BloqueoTemporal | null;

  @CreateDateColumn({ name: 'creado_en', type: 'datetime', precision: 6 })
  creadoEn: Date;

  @UpdateDateColumn({ name: 'actualizado_en', type: 'datetime', precision: 6 })
  actualizadoEn: Date;
}
