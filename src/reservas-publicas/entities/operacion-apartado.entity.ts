import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn,
  ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { BloqueoTemporal } from '../../disponibilidad/entities/bloqueo-temporal.entity';
import { Personal } from '../../profesionales/entities/personal.entity';
import { Sucursal } from '../../sucursales/entities/sucursal.entity';
import { Servicio } from '../../servicios/entities/servicio.entity';
import { SesionReservaPublica } from './sesion-reserva-publica.entity';

export type EstadoOperacionApartado = 'preparada' | 'concedida' | 'rechazada' | 'sustituida';

/** Fija selección y resultado por clave de operación para reintentos idempotentes. */
@Entity({ name: 'operaciones_apartado' })
@Index('uq_oa_negocio_id', ['negocioId', 'id'], { unique: true })
@Index('uq_oa_sesion_clave', ['negocioId', 'sesionId', 'clave'], { unique: true })
@Index('idx_oa_apartado', ['negocioId', 'apartadoId'])
@Check('chk_oa_seleccion_hash', 'CHAR_LENGTH(seleccion_hash) = 64')
export class OperacionApartado {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ name: 'negocio_id', type: 'int', unsigned: true })
  negocioId: number;

  @Column({ name: 'sesion_id', type: 'int', unsigned: true })
  sesionId: number;

  @ManyToOne(() => SesionReservaPublica, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn([{ name: 'negocio_id', referencedColumnName: 'negocioId',
    foreignKeyConstraintName: 'fk_oa_sesion' },
  { name: 'sesion_id', referencedColumnName: 'id' }])
  sesion: SesionReservaPublica;

  @Column({ type: 'varchar', length: 64 })
  clave: string;

  @Column({ type: 'bigint', unsigned: true })
  generacion: string;

  @Column({ name: 'seleccion_hash', type: 'char', length: 64 })
  seleccionHash: string;

  @Column({ name: 'personal_id', type: 'int', unsigned: true })
  personalId: number;

  @ManyToOne(() => Personal, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn([{ name: 'negocio_id', referencedColumnName: 'negocioId',
    foreignKeyConstraintName: 'fk_oa_personal' },
  { name: 'personal_id', referencedColumnName: 'id' }])
  personal: Personal;

  @Column({ name: 'sucursal_id', type: 'int', unsigned: true })
  sucursalId: number;

  @ManyToOne(() => Sucursal, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn([{ name: 'negocio_id', referencedColumnName: 'negocioId',
    foreignKeyConstraintName: 'fk_oa_sucursal' },
  { name: 'sucursal_id', referencedColumnName: 'id' }])
  sucursal: Sucursal;

  @Column({ name: 'servicio_id', type: 'int', unsigned: true })
  servicioId: number;

  @ManyToOne(() => Servicio, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn([{ name: 'negocio_id', referencedColumnName: 'negocioId',
    foreignKeyConstraintName: 'fk_oa_servicio' },
  { name: 'servicio_id', referencedColumnName: 'id' }])
  servicio: Servicio;

  @Column({ name: 'fecha_local', type: 'date' })
  fechaLocal: string;

  @Column({ name: 'hora_inicio', type: 'time' })
  horaInicio: string;

  @Column({ type: 'enum', enum: ['preparada', 'concedida', 'rechazada', 'sustituida'],
    default: 'preparada' })
  estado: EstadoOperacionApartado;

  @Column({ name: 'apartado_id', type: 'int', unsigned: true, nullable: true })
  apartadoId: number | null;

  @ManyToOne(() => BloqueoTemporal, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn([{ name: 'negocio_id', referencedColumnName: 'negocioId',
    foreignKeyConstraintName: 'fk_oa_apartado' },
  { name: 'apartado_id', referencedColumnName: 'id' }])
  apartado: BloqueoTemporal | null;

  @Column({ name: 'causa_publica', type: 'varchar', length: 64, nullable: true })
  causaPublica: string | null;

  @CreateDateColumn({ name: 'creado_en', type: 'datetime', precision: 6 })
  creadoEn: Date;

  @UpdateDateColumn({ name: 'actualizado_en', type: 'datetime', precision: 6 })
  actualizadoEn: Date;
}
