import { Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Usuario } from '../../usuarios/entities/usuario.entity';
import type { FiltrosCorte } from '../filtros-corte';

@Entity('cortes_reporte')
@Index('idx_cr_actor', ['negocioId', 'actorUsuarioId'])
@Index('idx_cr_expira', ['expiraEn'])
@Check('chk_cr_expira', 'expira_en = DATE_ADD(fecha_corte, INTERVAL 1 DAY)')
@Check('chk_cr_completo', 'completo IN (0,1)')
export class CorteReporte {
  @PrimaryColumn({ type: 'char', length: 36, charset: 'ascii', collation: 'ascii_bin' })
  id: string;

  @Column({ name: 'negocio_id', type: 'int', unsigned: true })
  negocioId: number;

  @Column({ name: 'actor_usuario_id', type: 'int', unsigned: true })
  actorUsuarioId: number;

  // La FK compuesta hace imposible asociar el corte a un actor de otro negocio.
  @ManyToOne(() => Usuario, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'negocio_id', referencedColumnName: 'negocioId', foreignKeyConstraintName: 'fk_cr_actor' },
    { name: 'actor_usuario_id', referencedColumnName: 'id' },
  ])
  actor: Usuario;

  @Column({ type: 'json' })
  filtros: FiltrosCorte;

  @Column({ name: 'fecha_corte', type: 'datetime', precision: 3 })
  fechaCorte: Date;

  @Column({ name: 'expira_en', type: 'datetime', precision: 3 })
  expiraEn: Date;

  @Column({ type: 'boolean', default: false })
  completo: boolean;
}
