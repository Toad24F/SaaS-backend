import { Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { PersonalServicio } from './personal-servicio.entity';
import { PersonalSucursal } from './personal-sucursal.entity';

/** Preferencia individual para una combinación de Profesional, servicio y sucursal. */
@Entity({ name: 'personal_servicios_sucursales' })
@Index('idx_pss_servicio', ['negocioId', 'personalId', 'servicioId'])
@Check('chk_pss_activo', 'activo IN (0, 1)')
export class PersonalServicioSucursal {
  // La clave de cuatro partes evita duplicados y conserva la pertenencia al negocio.
  @PrimaryColumn({ name: 'negocio_id', type: 'int', unsigned: true })
  negocioId: number;

  @PrimaryColumn({ name: 'personal_id', type: 'int', unsigned: true })
  personalId: number;

  @PrimaryColumn({ name: 'sucursal_id', type: 'int', unsigned: true })
  sucursalId: number;

  @PrimaryColumn({ name: 'servicio_id', type: 'int', unsigned: true })
  servicioId: number;

  @Column({ type: 'boolean', default: true })
  activo: boolean;

  // Ambas referencias exigen relaciones fuente del mismo Profesional y negocio.
  @ManyToOne(() => PersonalSucursal, (asignacion) => asignacion.servicios,
    { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'negocio_id', referencedColumnName: 'negocioId',
      foreignKeyConstraintName: 'fk_pss_asignacion' },
    { name: 'personal_id', referencedColumnName: 'personalId' },
    { name: 'sucursal_id', referencedColumnName: 'sucursalId' },
  ])
  asignacion: PersonalSucursal;

  @ManyToOne(() => PersonalServicio, (seleccion) => seleccion.sucursales,
    { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'negocio_id', referencedColumnName: 'negocioId',
      foreignKeyConstraintName: 'fk_pss_seleccion' },
    { name: 'personal_id', referencedColumnName: 'personalId' },
    { name: 'servicio_id', referencedColumnName: 'servicioId' },
  ])
  seleccion: PersonalServicio;
}
