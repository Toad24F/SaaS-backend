import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany,
  PrimaryGeneratedColumn } from 'typeorm';
import { Personal } from '../../profesionales/entities/personal.entity';
import { PersonalSucursal } from '../../profesionales/entities/personal-sucursal.entity';
import { FranjaExcepcionHorario } from './franja-excepcion-horario.entity';

/** Una cabecera sin hijas significa cierre de esa fecha; ausencia significa usar la semana. */
@Entity({ name: 'excepciones_horario' })
@Index('uq_excepciones_profesional_sucursal_fecha',
  ['negocioId', 'personalId', 'sucursalId', 'fechaLocal'], { unique: true })
@Index('uq_excepciones_negocio_id', ['negocioId', 'id'], { unique: true })
export class ExcepcionHorario {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @Column({ name: 'negocio_id', type: 'int', unsigned: true })
  negocioId: number;

  @Column({ name: 'personal_id', type: 'int', unsigned: true })
  personalId: number;

  @ManyToOne(() => Personal, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'negocio_id', referencedColumnName: 'negocioId' },
    { name: 'personal_id', referencedColumnName: 'id' },
  ])
  personal: Personal;

  @Column({ name: 'sucursal_id', type: 'int', unsigned: true })
  sucursalId: number;

  @ManyToOne(() => PersonalSucursal, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'negocio_id', referencedColumnName: 'negocioId' },
    { name: 'personal_id', referencedColumnName: 'personalId' },
    { name: 'sucursal_id', referencedColumnName: 'sucursalId' },
  ])
  asignacion: PersonalSucursal;

  @Column({ name: 'fecha_local', type: 'date' })
  fechaLocal: string;

  @OneToMany(() => FranjaExcepcionHorario, (franja) => franja.excepcion)
  franjas: FranjaExcepcionHorario[];
}
