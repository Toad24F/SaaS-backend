import {
  Column,
  CreateDateColumn,
  Entity,
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
export class CodigoAcceso {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ name: 'usuario_id', type: 'int', unsigned: true })
  usuarioId: number;

  @ManyToOne(() => Usuario, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'usuario_id' })
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
}
