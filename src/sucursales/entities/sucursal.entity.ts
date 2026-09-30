import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne,
  PrimaryGeneratedColumn, Unique } from 'typeorm';
import { Negocio } from '../../negocios/entities/negocio.entity';

/** Ubicación física del negocio; el estado se conserva para el cupo e historial futuros. */
@Entity({ name: 'sucursales' })
@Index('idx_sucursales_negocio_activo', ['negocioId', 'activo'])
@Unique('uq_sucursales_negocio_id', ['negocioId', 'id'])
@Check('chk_sucursales_nombre', 'CHAR_LENGTH(TRIM(nombre)) > 0')
@Check('chk_sucursales_direccion', 'CHAR_LENGTH(TRIM(direccion)) > 0')
@Check('chk_sucursales_telefono', 'CHAR_LENGTH(TRIM(telefono)) > 0')
@Check('chk_sucursales_zona', 'CHAR_LENGTH(TRIM(zona_horaria)) > 0')
export class Sucursal {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  // El negocio es obligatorio y se referencia explícitamente; nunca se deriva del ID de sucursal.
  @Column({ name: 'negocio_id', type: 'int', unsigned: true })
  negocioId: number;

  @ManyToOne(() => Negocio, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'negocio_id', referencedColumnName: 'id', foreignKeyConstraintName: 'fk_sucursales_negocio' })
  negocio: Negocio;

  @Column({ type: 'varchar', length: 150 })
  nombre: string;

  @Column({ type: 'varchar', length: 255 })
  direccion: string;

  @Column({ type: 'varchar', length: 20 })
  telefono: string;

  @Column({ name: 'zona_horaria', type: 'varchar', length: 64 })
  zonaHoraria: string;

  @Column({ name: 'url_google_maps', type: 'varchar', length: 2048, nullable: true })
  urlGoogleMaps: string | null;

  @Column({ name: 'notas_llegada', type: 'text', nullable: true })
  notasLlegada: string | null;

  // La desactivación conserva datos y permite contar solo sucursales activas.
  @Column({ type: 'boolean', default: true })
  activo: boolean;

  @CreateDateColumn({ name: 'creado_en', type: 'datetime', precision: 6 })
  creadoEn: Date;
}
