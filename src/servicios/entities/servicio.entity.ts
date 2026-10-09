import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne,
  PrimaryGeneratedColumn } from 'typeorm';
import { Negocio } from '../../negocios/entities/negocio.entity';
import { Personal } from '../../profesionales/entities/personal.entity';

/** Tarifa y duración únicas del negocio, independientes de sucursal y profesional. */
@Entity({ name: 'servicios' })
@Index('idx_servicios_negocio_activo', ['negocioId', 'activo'])
@Index('uq_servicios_negocio_id', ['negocioId', 'id'], { unique: true })
@Index('idx_servicios_creador', ['negocioId', 'creadorPersonalId'])
@Check('chk_servicios_nombre', 'CHAR_LENGTH(TRIM(nombre)) > 0')
@Check('chk_servicios_costo', 'costo >= 0')
@Check('chk_servicios_duracion', 'duracion_minutos > 0')
@Check('chk_servicios_activo', 'activo IN (0, 1)')
export class Servicio {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  // La pertenencia está en la fila; los comandos siempre la contrastan con el actor.
  @Column({ name: 'negocio_id', type: 'int', unsigned: true })
  negocioId: number;

  @ManyToOne(() => Negocio, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'negocio_id', referencedColumnName: 'id',
    foreignKeyConstraintName: 'fk_servicios_negocio' })
  negocio: Negocio;

  @Column({ type: 'varchar', length: 150 })
  nombre: string;

  // TypeORM devuelve DECIMAL como texto para no redondear importes binarios.
  @Column({ type: 'decimal', precision: 10, scale: 2 })
  costo: string;

  @Column({ name: 'duracion_minutos', type: 'int', unsigned: true })
  duracionMinutos: number;

  // Estado global: las futuras selecciones individuales se guardarán aparte.
  @Column({ type: 'boolean', default: true })
  activo: boolean;

  @CreateDateColumn({ name: 'creado_en', type: 'datetime', precision: 6 })
  creadoEn: Date;

  // El texto y la autoría son opcionales para conservar intacto el catálogo anterior.
  @Column({ type: 'text', nullable: true })
  descripcion: string | null;

  @Column({ name: 'creador_personal_id', type: 'int', unsigned: true, nullable: true })
  creadorPersonalId: number | null;

  // La pareja negocio/autor impide asociar un servicio con un perfil ajeno.
  @ManyToOne(() => Personal, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'negocio_id', referencedColumnName: 'negocioId',
      foreignKeyConstraintName: 'fk_servicios_creador' },
    { name: 'creador_personal_id', referencedColumnName: 'id' },
  ])
  creador: Personal | null;
}
