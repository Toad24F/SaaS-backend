import { Check, Column, Entity, JoinColumn, OneToOne, PrimaryColumn } from 'typeorm';
import { Negocio } from '../../negocios/entities/negocio.entity';

/** Los plazos se copian a cada generación; editar esta fila no mueve trabajos anteriores. */
@Entity({ name: 'configuracion_automatizaciones' })
@Check('chk_ca_version', 'version >= 1')
@Check('chk_ca_plazo', 'plazo_confirmacion_horas BETWEEN 6 AND 24')
@Check('chk_ca_recordatorio', 'recordatorio_horas BETWEEN 12 AND 48')
export class ConfiguracionAutomatizaciones {
  @PrimaryColumn({ name: 'negocio_id', type: 'int', unsigned: true }) negocioId: number;
  @OneToOne(() => Negocio, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'negocio_id', referencedColumnName: 'id', foreignKeyConstraintName: 'fk_ca_negocio' })
  negocio: Negocio;
  @Column({ type: 'int', unsigned: true, default: 1 }) version: number;
  @Column({ name: 'plazo_confirmacion_horas', type: 'tinyint', unsigned: true, default: 12 }) plazoConfirmacionHoras: number;
  @Column({ name: 'recordatorio_horas', type: 'tinyint', unsigned: true, default: 24 }) recordatorioHoras: number;
}
