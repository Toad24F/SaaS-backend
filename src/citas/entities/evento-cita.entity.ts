import { Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Negocio } from '../../negocios/entities/negocio.entity';
import { Usuario } from '../../usuarios/entities/usuario.entity';
import { Cita } from '../../disponibilidad/entities/cita.entity';
import { SesionReservaPublica } from '../../reservas-publicas/entities/sesion-reserva-publica.entity';

export type AccionEventoCita = 'alta' | 'cambio_estado' | 'cancelacion' | 'reactivacion' | 'cambio_horario';

/** Cada versión agrega una fila. La migración protege UPDATE/DELETE mediante triggers. */
@Entity({ name: 'eventos_cita' })
@Index('uq_ec_negocio_id', ['negocioId', 'id'], { unique: true })
@Index('uq_ec_cita_version', ['negocioId', 'citaId', 'versionResultante'], { unique: true })
@Index('idx_ec_cita_fecha', ['negocioId', 'citaId', 'ocurridoEn', 'id'])
@Index('idx_ec_actor_fecha', ['negocioId', 'actorUsuarioId', 'ocurridoEn'])
@Index('idx_ec_sesion', ['negocioId', 'sesionPublicaId'])
@Check('chk_ec_actor', '(actor_usuario_id IS NOT NULL AND sesion_publica_id IS NULL) OR (actor_usuario_id IS NULL AND sesion_publica_id IS NOT NULL)')
@Check('chk_ec_origen_publico', "sesion_publica_id IS NULL OR accion='alta'")
@Check('chk_ec_version', 'version_resultante >= 1')
export class EventoCita {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ name: 'negocio_id', type: 'int', unsigned: true })
  negocioId: number;

  @Column({ name: 'cita_id', type: 'int', unsigned: true })
  citaId: number;

  // Exactamente una identidad: cuenta interna o sesión pública comprobada en servidor.
  @Column({ name: 'actor_usuario_id', type: 'int', unsigned: true, nullable: true })
  actorUsuarioId: number | null;

  @Column({ name: 'sesion_publica_id', type: 'int', unsigned: true, nullable: true })
  sesionPublicaId: number | null;

  @ManyToOne(() => Negocio, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'negocio_id', referencedColumnName: 'id', foreignKeyConstraintName: 'fk_ec_negocio' })
  negocio: Negocio;

  @ManyToOne(() => Cita, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn([{ name: 'negocio_id', referencedColumnName: 'negocioId', foreignKeyConstraintName: 'fk_ec_cita' },
    { name: 'cita_id', referencedColumnName: 'id' }])
  cita: Cita;

  @ManyToOne(() => Usuario, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn([{ name: 'negocio_id', referencedColumnName: 'negocioId', foreignKeyConstraintName: 'fk_ec_actor' },
    { name: 'actor_usuario_id', referencedColumnName: 'id' }])
  actor: Usuario | null;

  @ManyToOne(() => SesionReservaPublica, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn([{ name: 'negocio_id', referencedColumnName: 'negocioId', foreignKeyConstraintName: 'fk_ec_sesion' },
    { name: 'sesion_publica_id', referencedColumnName: 'id' }])
  sesionPublica: SesionReservaPublica | null;

  @Column({ type: 'enum', enum: ['alta', 'cambio_estado', 'cancelacion', 'reactivacion', 'cambio_horario'] })
  accion: AccionEventoCita;

  // El escritor usa su reloj capturado; el default conserva el contrato del DDL.
  @Column({ name: 'ocurrido_en', type: 'datetime', precision: 6, default: () => 'CURRENT_TIMESTAMP(6)' })
  ocurridoEn: Date;

  @Column({ name: 'version_resultante', type: 'int', unsigned: true })
  versionResultante: number;

  // Los escritores seleccionan campos operativos; nunca asignan el formulario completo.
  @Column({ name: 'valores_antes', type: 'json', nullable: true })
  valoresAntes: Record<string, unknown> | null;

  @Column({ name: 'valores_despues', type: 'json' })
  valoresDespues: Record<string, unknown>;

  @Column({ type: 'varchar', length: 2000, nullable: true })
  motivo: string | null;
}
