import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn,
  ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Usuario } from '../../usuarios/entities/usuario.entity';
import { AltaAdministrador } from './alta-administrador.entity';

/** Autoridad compartida de correo: cada fila pertenece a invitación o cuenta. */
@Entity({ name: 'correos_acceso' })
@Index('uq_correos_acceso_correo', ['correo'], { unique: true })
@Index('uq_correos_acceso_alta', ['altaAdministradorId'], { unique: true })
@Index('uq_correos_acceso_usuario', ['usuarioId'], { unique: true })
@Check('chk_correos_acceso_correo',
  'BINARY correo = BINARY LOWER(TRIM(correo)) AND CHAR_LENGTH(correo) > 0')
@Check('chk_correos_acceso_titular',
  '(alta_administrador_id IS NOT NULL AND usuario_id IS NULL) OR (alta_administrador_id IS NULL AND usuario_id IS NOT NULL)')
export class CorreoAcceso {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @Column({ type: 'varchar', length: 150, transformer: {
    to: (correo: string) => correo.trim().toLowerCase(),
    from: (correo: string) => correo,
  } })
  correo: string;

  @Column({ name: 'alta_administrador_id', type: 'int', unsigned: true, nullable: true })
  altaAdministradorId: number | null;

  @ManyToOne(() => AltaAdministrador, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'alta_administrador_id' })
  altaAdministrador: AltaAdministrador | null;

  @Column({ name: 'usuario_id', type: 'int', unsigned: true, nullable: true })
  usuarioId: number | null;

  @ManyToOne(() => Usuario, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'usuario_id' })
  usuario: Usuario | null;

  @CreateDateColumn({ name: 'creado_en', type: 'datetime', precision: 6 })
  creadoEn: Date;
}
