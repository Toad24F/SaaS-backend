import { Check, Column, Entity, Index, JoinColumn, ManyToOne,
  PrimaryGeneratedColumn } from 'typeorm';
import { ExcepcionHorario } from './excepcion-horario.entity';

/** Franja válida de una fecha concreta; la cabecera puede existir sin ninguna hija. */
@Entity({ name: 'franjas_excepcion_horario' })
@Index('idx_franjas_excepcion_orden', ['negocioId', 'excepcionId', 'orden'])
@Check('chk_franjas_excepcion_orden', 'orden >= 0')
@Check('chk_franjas_excepcion_intervalo', `inicio_minutos BETWEEN 0 AND 1439
  AND fin_minutos BETWEEN 1 AND 1440 AND inicio_minutos < fin_minutos`)
@Check('chk_franjas_excepcion_descanso', `(descanso_inicio_minutos IS NULL AND descanso_fin_minutos IS NULL)
  OR (descanso_inicio_minutos IS NOT NULL AND descanso_fin_minutos IS NOT NULL
    AND descanso_inicio_minutos >= inicio_minutos
    AND descanso_inicio_minutos < descanso_fin_minutos
    AND descanso_fin_minutos <= fin_minutos)`)
export class FranjaExcepcionHorario {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @Column({ name: 'negocio_id', type: 'int', unsigned: true })
  negocioId: number;

  @Column({ name: 'excepcion_id', type: 'int', unsigned: true })
  excepcionId: number;

  @ManyToOne(() => ExcepcionHorario, (excepcion) => excepcion.franjas,
    { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'negocio_id', referencedColumnName: 'negocioId' },
    { name: 'excepcion_id', referencedColumnName: 'id' },
  ])
  excepcion: ExcepcionHorario;

  @Column({ type: 'int', unsigned: true, default: 0 })
  orden: number;

  @Column({ name: 'inicio_minutos', type: 'int', unsigned: true })
  inicioMinutos: number;

  @Column({ name: 'fin_minutos', type: 'int', unsigned: true })
  finMinutos: number;

  @Column({ name: 'descanso_inicio_minutos', type: 'int', unsigned: true, nullable: true })
  descansoInicioMinutos: number | null;

  @Column({ name: 'descanso_fin_minutos', type: 'int', unsigned: true, nullable: true })
  descansoFinMinutos: number | null;
}
