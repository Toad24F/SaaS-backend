import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne,
  PrimaryGeneratedColumn } from 'typeorm';
import { Negocio } from '../../negocios/entities/negocio.entity';

/** Referencia del cliente para citas; esta fase no publica CRUD de clientes. */
@Entity({ name: 'clientes' })
@Index('uq_clientes_negocio_id', ['negocioId', 'id'], { unique: true })
@Index('uq_cliente_por_negocio', ['negocioId', 'telefono'], { unique: true })
@Check('chk_clientes_nombre', 'CHAR_LENGTH(TRIM(nombre_completo)) > 0')
@Check('chk_clientes_telefono', 'CHAR_LENGTH(telefono) = 10')
export class Cliente {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @Column({ name: 'negocio_id', type: 'int', unsigned: true })
  negocioId: number;

  // Las citas enlazan negocio e ID para impedir asociar un cliente ajeno.
  @ManyToOne(() => Negocio, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'negocio_id', referencedColumnName: 'id',
    foreignKeyConstraintName: 'fk_clientes_negocio' })
  negocio: Negocio;

  @Column({ name: 'nombre_completo', type: 'varchar', length: 150 })
  nombreCompleto: string;

  @Column({ type: 'varchar', length: 10 })
  telefono: string;

  @Column({ type: 'varchar', length: 150, nullable: true })
  email: string | null;

  @CreateDateColumn({ name: 'creado_en', type: 'datetime', precision: 6 })
  creadoEn: Date;
}
