import { Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Servicio } from '../../servicios/entities/servicio.entity';
import { Personal } from './personal.entity';

/** Selección futura por Profesional, sin duplicar costo, duración ni estado global. */
@Entity({ name: 'personal_servicios' })
export class PersonalServicio {
  @PrimaryColumn({ name: 'negocio_id', type: 'int', unsigned: true })
  negocioId: number;

  @PrimaryColumn({ name: 'personal_id', type: 'int', unsigned: true })
  personalId: number;

  @PrimaryColumn({ name: 'servicio_id', type: 'int', unsigned: true })
  servicioId: number;

  @ManyToOne(() => Personal, (perfil) => perfil.servicios, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'negocio_id', referencedColumnName: 'negocioId' },
    { name: 'personal_id', referencedColumnName: 'id' },
  ])
  personal: Personal;

  @ManyToOne(() => Servicio, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'negocio_id', referencedColumnName: 'negocioId' },
    { name: 'servicio_id', referencedColumnName: 'id' },
  ])
  servicio: Servicio;
}
