import { Check, Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryColumn } from 'typeorm';
import { Sucursal } from '../../sucursales/entities/sucursal.entity';
import { Personal } from './personal.entity';
import { PersonalServicioSucursal } from './personal-servicio-sucursal.entity';

/** Asignación independiente del horario; cada relación conserva el tenant. */
@Entity({ name: 'personal_sucursales' })
@Check('chk_ps_activo', 'activo IN (0, 1)')
export class PersonalSucursal {
  @PrimaryColumn({ name: 'negocio_id', type: 'int', unsigned: true })
  negocioId: number;

  @PrimaryColumn({ name: 'personal_id', type: 'int', unsigned: true })
  personalId: number;

  @PrimaryColumn({ name: 'sucursal_id', type: 'int', unsigned: true })
  sucursalId: number;

  // Este interruptor no modifica el estado global ni el cupo de la sucursal.
  @Column({ type: 'boolean', default: true })
  activo: boolean;

  @ManyToOne(() => Personal, (perfil) => perfil.sucursales, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'negocio_id', referencedColumnName: 'negocioId' },
    { name: 'personal_id', referencedColumnName: 'id' },
  ])
  personal: Personal;

  @ManyToOne(() => Sucursal, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'negocio_id', referencedColumnName: 'negocioId' },
    { name: 'sucursal_id', referencedColumnName: 'id' },
  ])
  sucursal: Sucursal;

  @OneToMany(() => PersonalServicioSucursal, (oferta) => oferta.asignacion)
  servicios: PersonalServicioSucursal[];
}
