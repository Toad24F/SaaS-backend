import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn,
  ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Negocio } from '../../negocios/entities/negocio.entity';
import { Usuario } from '../../usuarios/entities/usuario.entity';

export enum EstadoAltaAdministrador {
  PENDIENTE = 'pendiente',
  ACTIVADA = 'activada',
}

/** Invitación inicial: existe sin cuenta y conserva a quién se emitió. */
@Entity({ name: 'altas_administrador' })
@Index('uq_altas_administrador_negocio', ['negocioId'], { unique: true })
@Index('uq_altas_administrador_negocio_id', ['negocioId', 'id'], { unique: true })
@Index('uq_altas_id_correo', ['id', 'correo'], { unique: true })
@Check('chk_altas_correo',
  'BINARY correo = BINARY LOWER(TRIM(correo)) AND CHAR_LENGTH(correo) > 0')
@Check('chk_altas_estado',
  "(estado = 'pendiente' AND usuario_creado_id IS NULL AND activado_en IS NULL) OR (estado = 'activada' AND usuario_creado_id IS NOT NULL AND activado_en IS NOT NULL AND activado_en >= creado_en)")
export class AltaAdministrador {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @Column({ name: 'negocio_id', type: 'int', unsigned: true })
  negocioId: number;

  @ManyToOne(() => Negocio, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'negocio_id' })
  negocio: Negocio;

  @Column({ type: 'varchar', length: 150, transformer: {
    to: (correo: string) => correo.trim().toLowerCase(),
    from: (correo: string) => correo,
  } })
  correo: string;

  @Column({ type: 'enum', enum: EstadoAltaAdministrador, default: EstadoAltaAdministrador.PENDIENTE })
  estado: EstadoAltaAdministrador;

  // Solo al activar aparece una cuenta completa del mismo negocio.
  @Column({ name: 'usuario_creado_id', type: 'int', unsigned: true, nullable: true })
  usuarioCreadoId: number | null;

  @ManyToOne(() => Usuario, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'negocio_id', referencedColumnName: 'negocioId' },
    { name: 'usuario_creado_id', referencedColumnName: 'id' },
  ])
  usuarioCreado: Usuario | null;

  @CreateDateColumn({ name: 'creado_en', type: 'datetime', precision: 6 })
  creadoEn: Date;

  @Column({ name: 'activado_en', type: 'datetime', precision: 6, nullable: true })
  activadoEn: Date | null;
}
