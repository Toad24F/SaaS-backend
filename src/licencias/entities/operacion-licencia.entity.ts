import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn,
  ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Licencia } from './licencia.entity';
import { Usuario } from '../../usuarios/entities/usuario.entity';

export enum AccionOperacionLicencia {
  SUSPENDER = 'suspender',
  REACTIVAR = 'reactivar',
  RENOVAR = 'renovar',
}

/** Resultado durable de una transición real; nunca guarda secretos del envío. */
@Entity({ name: 'operaciones_licencia' })
@Index('uq_operaciones_licencia_clave', ['negocioId', 'licenciaId', 'clave'], { unique: true })
@Index('uq_operaciones_licencia_referencia', ['negocioId', 'licenciaId', 'id'], { unique: true })
@Index('idx_operaciones_licencia_actor', ['actorId'])
@Check('chk_operaciones_licencia_clave', 'CHAR_LENGTH(clave) BETWEEN 16 AND 64 AND BINARY clave = BINARY TRIM(clave)')
@Check('chk_operaciones_licencia_hash', 'CHAR_LENGTH(parametros_hash) = 64')
@Check('chk_operaciones_licencia_resultado', 'JSON_VALID(resultado_reducido)')
export class OperacionLicencia {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ name: 'negocio_id', type: 'int', unsigned: true })
  negocioId: number;

  @Column({ name: 'licencia_id', type: 'int', unsigned: true })
  licenciaId: number;

  // La FK compuesta evita asociar una operación con licencia de otro negocio.
  @ManyToOne(() => Licencia, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'negocio_id', referencedColumnName: 'negocioId',
      foreignKeyConstraintName: 'fk_operaciones_licencia_licencia' },
    { name: 'licencia_id', referencedColumnName: 'id' },
  ])
  licencia: Licencia;

  @Column({ name: 'actor_id', type: 'int', unsigned: true })
  actorId: number;

  @ManyToOne(() => Usuario, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'actor_id', referencedColumnName: 'id',
    foreignKeyConstraintName: 'fk_operaciones_licencia_actor' })
  actor: Usuario;

  // Clave opaca para reconocer el mismo comando; la huella solo describe parámetros.
  @Column({ type: 'varchar', length: 64, charset: 'ascii', collation: 'ascii_bin' })
  clave: string;

  @Column({ type: 'enum', enum: AccionOperacionLicencia })
  accion: AccionOperacionLicencia;

  @Column({ name: 'parametros_hash', type: 'char', length: 64,
    charset: 'ascii', collation: 'ascii_bin' })
  parametrosHash: string;

  // JSON reducido para reproducir la respuesta sin guardar correo ni token.
  @Column({ name: 'resultado_reducido', type: 'text' })
  resultadoReducido: string;

  @CreateDateColumn({ name: 'creado_en', type: 'datetime', precision: 6 })
  creadoEn: Date;
}
