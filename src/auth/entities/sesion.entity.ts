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

/** Sesión revocable identificada desde el JWT mediante sesionId. */
@Entity({ name: 'sesiones' })
@Index('idx_sesiones_usuario', ['usuarioId', 'revocadaEn', 'expiraEn'])
@Index('idx_sesiones_expiracion', ['expiraEn'])
@Check('chk_sesiones_expiracion', 'expira_en = DATE_ADD(creada_en, INTERVAL 1 HOUR)')
@Check('chk_sesiones_revocacion', 'revocada_en IS NULL OR revocada_en >= creada_en')
export class Sesion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'usuario_id', type: 'int', unsigned: true })
  usuarioId: number;

  @ManyToOne(() => Usuario, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'usuario_id' })
  usuario: Usuario;

  @CreateDateColumn({ name: 'creada_en', type: 'datetime', precision: 6 })
  creadaEn: Date;

  @Column({ name: 'expira_en', type: 'datetime', precision: 6 })
  expiraEn: Date;

  @Column({ name: 'revocada_en', type: 'datetime', precision: 6, nullable: true })
  revocadaEn: Date | null;
}
