import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne,
  PrimaryGeneratedColumn } from 'typeorm';
import { Negocio } from '../../negocios/entities/negocio.entity';
import { Personal } from '../../profesionales/entities/personal.entity';
import { Sucursal } from '../../sucursales/entities/sucursal.entity';
import { Usuario } from '../../usuarios/entities/usuario.entity';
import type { TipoBloqueo } from '../validar-bloqueo';

/** Null en personal indica equipo; null en sucursal indica todas las sedes. */
@Entity({ name: 'bloqueos_horario' })
@Index('uq_bloqueos_negocio_id', ['negocioId', 'id'], { unique: true })
@Index('idx_bloqueos_profesional_fechas', ['negocioId', 'personalId', 'fechaInicio', 'fechaFin'])
@Index('idx_bloqueos_sucursal_fechas', ['negocioId', 'sucursalId', 'fechaInicio', 'fechaFin'])
@Check('chk_bloqueos_tipo', "tipo IN ('vacaciones','dia_festivo','emergencia')")
@Check('chk_bloqueos_motivo', 'CHAR_LENGTH(TRIM(motivo)) > 0')
@Check('chk_bloqueos_fechas', 'fecha_inicio <= fecha_fin')
@Check('chk_bloqueos_horas', `(inicio_minutos IS NULL AND fin_minutos IS NULL) OR
  (inicio_minutos BETWEEN 0 AND 1439 AND fin_minutos BETWEEN 1 AND 1440
    AND (fecha_inicio < fecha_fin OR inicio_minutos < fin_minutos))`)
export class BloqueoHorario {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @Column({ name: 'negocio_id', type: 'int', unsigned: true })
  negocioId: number;

  @ManyToOne(() => Negocio, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'negocio_id', referencedColumnName: 'id' })
  negocio: Negocio;

  @Column({ name: 'personal_id', type: 'int', unsigned: true, nullable: true })
  personalId: number | null;

  // La FK compuesta impide asociar un perfil de otro negocio, incluso mediante SQL directo.
  @ManyToOne(() => Personal, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn([{ name: 'negocio_id', referencedColumnName: 'negocioId' },
    { name: 'personal_id', referencedColumnName: 'id' }])
  personal: Personal | null;

  @Column({ name: 'sucursal_id', type: 'int', unsigned: true, nullable: true })
  sucursalId: number | null;

  @ManyToOne(() => Sucursal, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn([{ name: 'negocio_id', referencedColumnName: 'negocioId' },
    { name: 'sucursal_id', referencedColumnName: 'id' }])
  sucursal: Sucursal | null;

  @Column({ name: 'creador_usuario_id', type: 'int', unsigned: true })
  creadorUsuarioId: number;

  @ManyToOne(() => Usuario, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn([{ name: 'negocio_id', referencedColumnName: 'negocioId' },
    { name: 'creador_usuario_id', referencedColumnName: 'id' }])
  creador: Usuario;

  @Column({ type: 'varchar', length: 30 })
  tipo: TipoBloqueo;

  @Column({ type: 'varchar', length: 500 })
  motivo: string;

  @Column({ name: 'fecha_inicio', type: 'date' })
  fechaInicio: string;

  @Column({ name: 'fecha_fin', type: 'date' })
  fechaFin: string;

  @Column({ name: 'inicio_minutos', type: 'int', unsigned: true, nullable: true })
  inicioMinutos: number | null;

  @Column({ name: 'fin_minutos', type: 'int', unsigned: true, nullable: true })
  finMinutos: number | null;

  @CreateDateColumn({ name: 'creado_en', type: 'datetime', precision: 6 })
  creadoEn: Date;
}
