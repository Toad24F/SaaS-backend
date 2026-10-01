import { Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Sucursal } from '../../sucursales/entities/sucursal.entity';
import { Personal } from './personal.entity';

/** Asignación independiente del horario; cada relación conserva el tenant. */
@Entity({ name: 'personal_sucursales' })
export class PersonalSucursal {
  @PrimaryColumn({ name: 'negocio_id', type: 'int', unsigned: true })
  negocioId: number;

  @PrimaryColumn({ name: 'personal_id', type: 'int', unsigned: true })
  personalId: number;

  @PrimaryColumn({ name: 'sucursal_id', type: 'int', unsigned: true })
  sucursalId: number;

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
}
