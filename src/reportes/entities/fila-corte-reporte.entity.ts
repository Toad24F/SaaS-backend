import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import type { Cita } from '../../disponibilidad/entities/cita.entity';
import { CorteReporte } from './corte-reporte.entity';

/** Copia histórica de dimensiones y hechos. Solo el corte es una relación viva. */
@Entity('filas_corte_reporte')
@Index('idx_fcr_orden', ['corteId', 'fechaCivil', 'inicioUtc', 'citaId'])
export class FilaCorteReporte {
  @PrimaryColumn({ name: 'corte_id', type: 'char', length: 36, charset: 'ascii', collation: 'ascii_bin' })
  corteId: string;

  @PrimaryColumn({ name: 'cita_id', type: 'int', unsigned: true })
  citaId: number;

  @ManyToOne(() => CorteReporte, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'corte_id', foreignKeyConstraintName: 'fk_fcr_corte' })
  corte: CorteReporte;

  @Column({ name: 'sucursal_id', type: 'int', unsigned: true })
  sucursalId: number;

  @Column({ name: 'personal_id', type: 'int', unsigned: true })
  personalId: number;

  @Column({ name: 'servicio_id', type: 'int', unsigned: true })
  servicioId: number;

  @Column({ name: 'nombre_sucursal', type: 'varchar', length: 150, nullable: true })
  nombreSucursal: string | null;

  @Column({ name: 'nombre_profesional', type: 'varchar', length: 150, nullable: true })
  nombreProfesional: string | null;

  @Column({ name: 'nombre_servicio', type: 'varchar', length: 150, nullable: true })
  nombreServicio: string | null;

  @Column({ name: 'fecha_civil', type: 'date' })
  fechaCivil: string;

  @Column({ name: 'inicio_utc', type: 'datetime', precision: 3 })
  inicioUtc: Date;

  @Column({ name: 'fin_utc', type: 'datetime', precision: 3 })
  finUtc: Date;

  @Column({ type: 'enum', enum: ['pendiente', 'confirmada', 'completada', 'cancelada', 'no_asistio'] })
  estado: Cita['estado'];

  @Column({ type: 'enum', enum: ['portal_publico', 'manual'] })
  origen: Cita['origen'];

  @Column({ name: 'costo_aceptado', type: 'decimal', precision: 10, scale: 2, nullable: true })
  costoAceptado: string | null;

  @Column({ name: 'causa_cancelacion', type: 'enum', enum: ['falta_confirmacion_plazo'], nullable: true })
  causaCancelacion: Cita['causaCancelacion'];
}
