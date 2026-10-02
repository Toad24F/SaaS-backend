import { Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Personal } from '../../profesionales/entities/personal.entity';
import { PersonalSucursal } from '../../profesionales/entities/personal-sucursal.entity';

/** Franja recurrente con ID estable; un borrador inactivo admite datos incompletos. */
@Entity({ name: 'horarios_personal' })
@Index('idx_horarios_personal_dia_orden', ['negocioId', 'personalId', 'diaSemana', 'orden'])
@Index('uq_horarios_negocio_id', ['negocioId', 'id'], { unique: true })
@Check('chk_horarios_dia', 'dia_semana BETWEEN 0 AND 6')
@Check('chk_horarios_orden', 'orden >= 0')
@Check('chk_horarios_activo', 'activo IN (0, 1)')
@Check('chk_horarios_limites', `(inicio_minutos IS NULL OR inicio_minutos BETWEEN 0 AND 1439)
  AND (fin_minutos IS NULL OR fin_minutos BETWEEN 1 AND 1440)
  AND (descanso_inicio_minutos IS NULL OR descanso_inicio_minutos BETWEEN 0 AND 1439)
  AND (descanso_fin_minutos IS NULL OR descanso_fin_minutos BETWEEN 1 AND 1440)`)
@Check('chk_horarios_pares', `(inicio_minutos IS NULL OR fin_minutos IS NULL OR inicio_minutos < fin_minutos)
  AND (descanso_inicio_minutos IS NULL OR descanso_fin_minutos IS NULL
    OR descanso_inicio_minutos < descanso_fin_minutos)`)
@Check('chk_horarios_completos', `activo = 0 OR (
  sucursal_id IS NOT NULL AND inicio_minutos IS NOT NULL AND fin_minutos IS NOT NULL
  AND inicio_minutos < fin_minutos
  AND ((descanso_inicio_minutos IS NULL AND descanso_fin_minutos IS NULL)
    OR (descanso_inicio_minutos IS NOT NULL AND descanso_fin_minutos IS NOT NULL
      AND descanso_inicio_minutos >= inicio_minutos
      AND descanso_inicio_minutos < descanso_fin_minutos
      AND descanso_fin_minutos <= fin_minutos)))`)
export class HorarioPersonal {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @Column({ name: 'negocio_id', type: 'int', unsigned: true })
  negocioId: number;

  @Column({ name: 'personal_id', type: 'int', unsigned: true })
  personalId: number;

  @ManyToOne(() => Personal, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'negocio_id', referencedColumnName: 'negocioId' },
    { name: 'personal_id', referencedColumnName: 'id' },
  ])
  personal: Personal;

  @Column({ name: 'dia_semana', type: 'tinyint', unsigned: true })
  diaSemana: number;

  @Column({ type: 'int', unsigned: true, default: 0 })
  orden: number;

  @Column({ name: 'sucursal_id', type: 'int', unsigned: true, nullable: true })
  sucursalId: number | null;

  // La relación triple exige una asignación del mismo Profesional y negocio.
  @ManyToOne(() => PersonalSucursal, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'negocio_id', referencedColumnName: 'negocioId' },
    { name: 'personal_id', referencedColumnName: 'personalId' },
    { name: 'sucursal_id', referencedColumnName: 'sucursalId' },
  ])
  asignacion: PersonalSucursal | null;

  @Column({ name: 'inicio_minutos', type: 'int', unsigned: true, nullable: true })
  inicioMinutos: number | null;

  @Column({ name: 'fin_minutos', type: 'int', unsigned: true, nullable: true })
  finMinutos: number | null;

  @Column({ name: 'descanso_inicio_minutos', type: 'int', unsigned: true, nullable: true })
  descansoInicioMinutos: number | null;

  @Column({ name: 'descanso_fin_minutos', type: 'int', unsigned: true, nullable: true })
  descansoFinMinutos: number | null;

  @Column({ type: 'boolean', default: false })
  activo: boolean;
}
