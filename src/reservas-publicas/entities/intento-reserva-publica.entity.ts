import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn,
  ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { BloqueoTemporal } from '../../disponibilidad/entities/bloqueo-temporal.entity';
import { Cita } from '../../disponibilidad/entities/cita.entity';
import { SesionReservaPublica } from './sesion-reserva-publica.entity';

export type EstadoIntentoReserva = 'preparado' | 'registrado' | 'no_registrado';

/** Clave y resultado durable del envío; no guarda un estado ligado a un proceso vivo. */
@Entity({ name: 'intentos_reserva_publica' })
@Index('uq_irp_negocio_id', ['negocioId', 'id'], { unique: true })
@Index('uq_irp_sesion_clave', ['negocioId', 'sesionId', 'clave'], { unique: true })
@Index('uq_irp_cita', ['negocioId', 'citaId'], { unique: true })
@Index('idx_irp_apartado', ['negocioId', 'apartadoId'])
@Check('chk_irp_formulario_hash',
  'formulario_hash IS NULL OR CHAR_LENGTH(formulario_hash) = 64')
export class IntentoReservaPublica {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ name: 'negocio_id', type: 'int', unsigned: true })
  negocioId: number;

  @Column({ name: 'sesion_id', type: 'int', unsigned: true })
  sesionId: number;

  @ManyToOne(() => SesionReservaPublica, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn([{ name: 'negocio_id', referencedColumnName: 'negocioId',
    foreignKeyConstraintName: 'fk_irp_sesion' },
  { name: 'sesion_id', referencedColumnName: 'id' }])
  sesion: SesionReservaPublica;

  @Column({ type: 'varchar', length: 64 })
  clave: string;

  @Column({ name: 'apartado_id', type: 'int', unsigned: true })
  apartadoId: number;

  @ManyToOne(() => BloqueoTemporal, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn([{ name: 'negocio_id', referencedColumnName: 'negocioId',
    foreignKeyConstraintName: 'fk_irp_apartado' },
  { name: 'apartado_id', referencedColumnName: 'id' }])
  apartado: BloqueoTemporal;

  // Preparar un intento no recibe todavía contacto; la huella se fija al enviar.
  @Column({ name: 'formulario_hash', type: 'char', length: 64, nullable: true })
  formularioHash: string | null;

  @Column({ type: 'enum', enum: ['preparado', 'registrado', 'no_registrado'],
    default: 'preparado' })
  estado: EstadoIntentoReserva;

  @Column({ name: 'causa_publica', type: 'varchar', length: 64, nullable: true })
  causaPublica: string | null;

  @Column({ name: 'cita_id', type: 'int', unsigned: true, nullable: true })
  citaId: number | null;

  @ManyToOne(() => Cita, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn([{ name: 'negocio_id', referencedColumnName: 'negocioId',
    foreignKeyConstraintName: 'fk_irp_cita' },
  { name: 'cita_id', referencedColumnName: 'id' }])
  cita: Cita | null;

  @CreateDateColumn({ name: 'creado_en', type: 'datetime', precision: 6 })
  creadoEn: Date;

  @UpdateDateColumn({ name: 'actualizado_en', type: 'datetime', precision: 6 })
  actualizadoEn: Date;
}
