import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Negocio } from '../../negocios/entities/negocio.entity';
import { Usuario } from '../../usuarios/entities/usuario.entity';
import { PersonalSucursal } from './personal-sucursal.entity';
import { PersonalServicio } from './personal-servicio.entity';

/** Perfil operativo: identidad, credenciales y estado viven solo en Usuario. */
@Entity({ name: 'personal' })
@Index('uq_personal_usuario', ['usuarioId'], { unique: true })
@Index('uq_personal_negocio_id', ['negocioId', 'id'], { unique: true })
export class Personal {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @Column({ name: 'negocio_id', type: 'int', unsigned: true })
  negocioId: number;

  @ManyToOne(() => Negocio, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'negocio_id', referencedColumnName: 'id',
    foreignKeyConstraintName: 'fk_personal_negocio' })
  negocio: Negocio;

  @Column({ name: 'usuario_id', type: 'int', unsigned: true })
  usuarioId: number;

  // La FK compuesta hace imposible vincular una cuenta de otro negocio.
  @ManyToOne(() => Usuario, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'negocio_id', referencedColumnName: 'negocioId' },
    { name: 'usuario_id', referencedColumnName: 'id' },
  ])
  usuario: Usuario;

  @OneToMany(() => PersonalSucursal, (relacion) => relacion.personal)
  sucursales: PersonalSucursal[];

  @OneToMany(() => PersonalServicio, (relacion) => relacion.personal)
  servicios: PersonalServicio[];
}
