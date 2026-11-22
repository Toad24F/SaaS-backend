import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne,
  PrimaryGeneratedColumn } from 'typeorm';
import { Negocio } from '../../negocios/entities/negocio.entity';

/** Ficha de cliente compartida por el directorio y las citas. */
@Entity({ name: 'clientes' })
@Index('uq_clientes_negocio_id', ['negocioId', 'id'], { unique: true })
// El teléfono es un dato de contacto compartible, no la identidad del cliente.
@Index('idx_cliente_por_negocio_telefono', ['negocioId', 'telefono'])
@Index('idx_clientes_fusion', ['negocioId', 'fusionadoEnId'])
@Check('chk_clientes_nombre', 'CHAR_LENGTH(TRIM(nombre_completo)) > 0')
@Check('chk_clientes_telefono', 'CHAR_LENGTH(telefono) = 10')
@Check('chk_clientes_version', 'version >= 1')
export class Cliente {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  // La versión pertenece a esta ficha; corregirla no debe reescribir snapshots de citas.
  @Column({ type: 'int', unsigned: true, default: 1 })
  version: number;

  @Column({ name: 'negocio_id', type: 'int', unsigned: true })
  negocioId: number;

  // Las citas enlazan negocio e ID para impedir asociar un cliente ajeno.
  @ManyToOne(() => Negocio, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'negocio_id', referencedColumnName: 'id',
    foreignKeyConstraintName: 'fk_clientes_negocio' })
  negocio: Negocio;

  @Column({ name: 'nombre_completo', type: 'varchar', length: 150 })
  nombreCompleto: string;

  // Clave UTF-8 binaria para preservar acentos, signos y ñ; nullable durante el despliegue aditivo.
  @Column({ name: 'nombre_normalizado', type: 'varbinary', length: 1800, nullable: true })
  nombreNormalizado: Buffer | null;

  @Column({ name: 'fusionado_en_id', type: 'int', unsigned: true, nullable: true })
  fusionadoEnId: number | null;

  @ManyToOne(() => Cliente, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn([{ name: 'negocio_id', referencedColumnName: 'negocioId', foreignKeyConstraintName: 'fk_clientes_fusion' },
    { name: 'fusionado_en_id', referencedColumnName: 'id' }])
  fusionadoEn: Cliente | null;

  @Column({ type: 'varchar', length: 10 })
  telefono: string;

  @Column({ type: 'varchar', length: 150, nullable: true })
  email: string | null;

  @CreateDateColumn({ name: 'creado_en', type: 'datetime', precision: 6 })
  creadoEn: Date;
}
