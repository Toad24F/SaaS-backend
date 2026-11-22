import { Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Cita } from '../../disponibilidad/entities/cita.entity';

export type CategoriaCondicion = 'normal' | 'proxima' | 'manual_heredada';
export type EstadoPolitica = 'pendiente' | 'confirmada' | 'seguimiento_manual' | 'cancelada' | 'anulada';
export type OrigenConfirmacion = 'personal' | 'whatsapp';

/** Una fila por generación: el vencimiento nulo expresa seguimiento sin cancelador. */
@Entity({ name: 'condiciones_confirmacion_cita' })
@Index('uq_ccc_negocio_cita_generacion', ['negocioId', 'citaId', 'generacion'], { unique: true })
@Index('uq_ccc_referencia_vigente', ['negocioId', 'citaId', 'generacion', 'id'], { unique: true })
@Index('idx_ccc_vencimiento', ['estadoPolitica', 'vencimientoUtc'])
@Check('chk_ccc_generacion', 'generacion >= 1')
@Check('chk_ccc_plazo', 'plazo_aplicado_minutos IS NULL OR plazo_aplicado_minutos > 0')
@Check('chk_ccc_vencimiento', 'vencimiento_utc IS NULL OR plazo_aplicado_minutos IS NOT NULL')
@Check('chk_ccc_confirmacion', '(confirmado_en IS NULL AND origen_confirmacion IS NULL) OR (confirmado_en IS NOT NULL AND origen_confirmacion IS NOT NULL)')
export class CondicionConfirmacionCita {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true }) id: string;
  @Column({ name: 'negocio_id', type: 'int', unsigned: true }) negocioId: number;
  @Column({ name: 'cita_id', type: 'int', unsigned: true }) citaId: number;
  @ManyToOne(() => Cita, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn([{ name: 'negocio_id', referencedColumnName: 'negocioId', foreignKeyConstraintName: 'fk_ccc_cita' },
    { name: 'cita_id', referencedColumnName: 'id' }]) cita: Cita;
  @Column({ type: 'int', unsigned: true }) generacion: number;
  @Column({ type: 'enum', enum: ['normal', 'proxima', 'manual_heredada'] }) categoria: CategoriaCondicion;
  @Column({ name: 'instante_base', type: 'datetime', precision: 3 }) instanteBase: Date;
  @Column({ name: 'plazo_aplicado_minutos', type: 'smallint', unsigned: true, nullable: true }) plazoAplicadoMinutos: number | null;
  @Column({ name: 'vencimiento_utc', type: 'datetime', precision: 3, nullable: true }) vencimientoUtc: Date | null;
  @Column({ name: 'motivo_seguimiento', type: 'varchar', length: 500, nullable: true }) motivoSeguimiento: string | null;
  @Column({ name: 'estado_politica', type: 'enum', enum: ['pendiente', 'confirmada', 'seguimiento_manual', 'cancelada', 'anulada'], default: 'pendiente' }) estadoPolitica: EstadoPolitica;
  @Column({ name: 'version_configuracion', type: 'int', unsigned: true, nullable: true }) versionConfiguracion: number | null;
  @Column({ name: 'confirmado_en', type: 'datetime', precision: 3, nullable: true }) confirmadoEn: Date | null;
  @Column({ name: 'origen_confirmacion', type: 'enum', enum: ['personal', 'whatsapp'], nullable: true }) origenConfirmacion: OrigenConfirmacion | null;
}
