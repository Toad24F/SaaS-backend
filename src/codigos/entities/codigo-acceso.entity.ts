import {
  Column,
  Check,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Usuario } from '../../usuarios/entities/usuario.entity';

export enum PropositoCodigoAcceso {
  ACTIVACION_ADMIN = 'activacion_admin',
  ACTIVACION_RECEPCIONISTA = 'activacion_recepcionista',
  RECUPERACION = 'recuperacion',
}

/** Historial del código: solo persiste su hash, nunca el valor entregable. */
@Entity({ name: 'codigos_acceso' })
@Index('uq_codigos_cuenta_proposito', ['usuarioId', 'proposito', 'vigenteUnico'], {
  unique: true,
})
@Index('idx_codigos_destinatario', ['negocioId', 'usuarioId'])
@Index('idx_codigos_expiracion', ['expiraEn'])
@Check('chk_codigos_hash', "CHAR_LENGTH(codigo_hash) = 64 AND codigo_hash NOT REGEXP '[^0-9a-f]'")
@Check('chk_codigos_expiracion', 'expira_en > emitido_en')
@Check('chk_codigos_consumo', 'consumido_en IS NULL OR (consumido_en >= emitido_en AND consumido_en < expira_en)')
@Check('chk_codigos_invalidacion', 'invalidado_en IS NULL OR invalidado_en >= emitido_en')
@Check('chk_codigos_estado', 'consumido_en IS NULL OR invalidado_en IS NULL')
export class CodigoAcceso {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ name: 'negocio_id', type: 'int', unsigned: true })
  negocioId: number;

  @Column({ name: 'usuario_id', type: 'int', unsigned: true })
  usuarioId: number;

  @ManyToOne(() => Usuario, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'negocio_id', referencedColumnName: 'negocioId' },
    { name: 'usuario_id', referencedColumnName: 'id' },
  ])
  usuario: Usuario;

  @Column({ name: 'emisor_usuario_id', type: 'int', unsigned: true })
  emisorUsuarioId: number;

  @ManyToOne(() => Usuario, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'emisor_usuario_id' })
  emisor: Usuario;

  @Column({ type: 'enum', enum: PropositoCodigoAcceso })
  proposito: PropositoCodigoAcceso;

  @Column({
    name: 'codigo_hash',
    type: 'char',
    length: 64,
    unique: true,
    select: false,
  })
  codigoHash: string;

  @CreateDateColumn({ name: 'emitido_en', type: 'datetime', precision: 6 })
  emitidoEn: Date;

  @Column({ name: 'expira_en', type: 'datetime', precision: 6 })
  expiraEn: Date;

  @Column({ name: 'consumido_en', type: 'datetime', precision: 6, nullable: true })
  consumidoEn: Date | null;

  @Column({ name: 'invalidado_en', type: 'datetime', precision: 6, nullable: true })
  invalidadoEn: Date | null;

  // Restringe a un código vigente por cuenta y propósito sin borrar historial.
  @Column({
    name: 'vigente_unico',
    type: 'tinyint',
    nullable: true,
    asExpression:
      'CASE WHEN consumido_en IS NULL AND invalidado_en IS NULL THEN 1 ELSE NULL END',
    generatedType: 'STORED',
    select: false,
  })
  vigenteUnico: number | null;
}
