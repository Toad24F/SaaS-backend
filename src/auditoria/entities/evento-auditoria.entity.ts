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
import { Licencia } from '../../licencias/entities/licencia.entity';
import { Negocio } from '../../negocios/entities/negocio.entity';
import { Usuario } from '../../usuarios/entities/usuario.entity';

export type ValoresAuditoria = Record<string, unknown>;

/**
 * Evidencia inmutable de una transición real. Los servicios que la creen deben
 * filtrar contraseñas, códigos, hashes y tokens antes de asignar los valores.
 */
@Entity({ name: 'eventos_auditoria' })
@Index('idx_auditoria_negocio_fecha', ['negocioId', 'ocurridoEn'])
@Index('idx_auditoria_actor_fecha', ['actorUsuarioId', 'ocurridoEn'])
@Check('chk_auditoria_destino', '(usuario_id IS NULL AND licencia_id IS NULL) OR negocio_id IS NOT NULL')
@Check('chk_auditoria_accion', 'CHAR_LENGTH(TRIM(accion)) > 0')
export class EventoAuditoria {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ name: 'operacion_id', type: 'char', length: 36, unique: true })
  operacionId: string;

  @Column({ name: 'actor_usuario_id', type: 'int', unsigned: true })
  actorUsuarioId: number;

  @ManyToOne(() => Usuario, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'actor_usuario_id' })
  actor: Usuario;

  @Column({ name: 'negocio_id', type: 'int', unsigned: true, nullable: true })
  negocioId: number | null;

  @ManyToOne(() => Negocio, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'negocio_id' })
  negocio: Negocio | null;

  @Column({ name: 'usuario_id', type: 'int', unsigned: true, nullable: true })
  usuarioId: number | null;

  @ManyToOne(() => Usuario, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'negocio_id', referencedColumnName: 'negocioId' },
    { name: 'usuario_id', referencedColumnName: 'id' },
  ])
  usuario: Usuario | null;

  @Column({ name: 'licencia_id', type: 'int', unsigned: true, nullable: true })
  licenciaId: number | null;

  @ManyToOne(() => Licencia, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'negocio_id', referencedColumnName: 'negocioId' },
    { name: 'licencia_id', referencedColumnName: 'id' },
  ])
  licencia: Licencia | null;

  @Column({ length: 64 })
  accion: string;

  @CreateDateColumn({ name: 'ocurrido_en', type: 'datetime', precision: 6 })
  ocurridoEn: Date;

  @Column({ name: 'valores_antes', type: 'json', nullable: true })
  valoresAntes: ValoresAuditoria | null;

  @Column({ name: 'valores_despues', type: 'json', nullable: true })
  valoresDespues: ValoresAuditoria | null;
}
