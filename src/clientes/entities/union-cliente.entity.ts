import { Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Negocio } from '../../negocios/entities/negocio.entity';
import { Cliente } from '../../disponibilidad/entities/cliente.entity';
import { Usuario } from '../../usuarios/entities/usuario.entity';

/** Decisión de unión. Guarda referencias y versiones sin copiar datos de contacto. */
@Entity({ name: 'uniones_cliente' })
@Index('uq_uc_negocio_id', ['negocioId', 'id'], { unique: true })
@Index('uq_uc_actor_clave', ['negocioId', 'actorUsuarioId', 'clave'], { unique: true })
@Index('idx_uc_origen', ['negocioId', 'origenId'])
@Index('idx_uc_destino', ['negocioId', 'destinoId'])
@Check('chk_uc_fichas', 'origen_id <> destino_id')
@Check('chk_uc_versiones', 'version_origen >= 1 AND version_destino >= 1')
@Check('chk_uc_clave', 'CHAR_LENGTH(clave) BETWEEN 16 AND 64 AND BINARY clave = BINARY TRIM(clave)')
@Check('chk_uc_contenido_hash', "contenido_hash IS NULL OR contenido_hash REGEXP '^[0-9a-f]{64}$'")
export class UnionCliente {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ name: 'negocio_id', type: 'int', unsigned: true })
  negocioId: number;

  @Column({ name: 'origen_id', type: 'int', unsigned: true })
  origenId: number;

  @Column({ name: 'destino_id', type: 'int', unsigned: true })
  destinoId: number;

  @Column({ name: 'actor_usuario_id', type: 'int', unsigned: true })
  actorUsuarioId: number;

  @Column({ name: 'version_origen', type: 'int', unsigned: true })
  versionOrigen: number;

  @Column({ name: 'version_destino', type: 'int', unsigned: true })
  versionDestino: number;

  @Column({ type: 'varchar', length: 64, charset: 'ascii', collation: 'ascii_bin' })
  clave: string;

  // La huella permite recuperar una aceptación sin guardar los datos propuestos.
  @Column({ name: 'contenido_hash', type: 'char', length: 64, charset: 'ascii', collation: 'ascii_bin', nullable: true })
  contenidoHash: string | null;

  @Column({ name: 'ocurrido_en', type: 'datetime', precision: 6, default: () => 'CURRENT_TIMESTAMP(6)' })
  ocurridoEn: Date;

  @ManyToOne(() => Negocio, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'negocio_id', referencedColumnName: 'id', foreignKeyConstraintName: 'fk_uc_negocio' })
  negocio: Negocio;

  // Las relaciones compuestas mantienen origen, destino y actor en el negocio de la operación.
  @ManyToOne(() => Cliente, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn([{ name: 'negocio_id', referencedColumnName: 'negocioId', foreignKeyConstraintName: 'fk_uc_origen' },
    { name: 'origen_id', referencedColumnName: 'id' }])
  origen: Cliente;

  @ManyToOne(() => Cliente, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn([{ name: 'negocio_id', referencedColumnName: 'negocioId', foreignKeyConstraintName: 'fk_uc_destino' },
    { name: 'destino_id', referencedColumnName: 'id' }])
  destino: Cliente;

  @ManyToOne(() => Usuario, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn([{ name: 'negocio_id', referencedColumnName: 'negocioId', foreignKeyConstraintName: 'fk_uc_actor' },
    { name: 'actor_usuario_id', referencedColumnName: 'id' }])
  actor: Usuario;
}
