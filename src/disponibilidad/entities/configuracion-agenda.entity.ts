import { Check, Column, CreateDateColumn, Entity, JoinColumn, ManyToOne,
  PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { Negocio } from '../../negocios/entities/negocio.entity';

/** Una fila opcional por negocio; sin fila se aplicarán valores efectivos iniciales. */
@Entity({ name: 'configuracion_agenda' })
@Check('chk_agenda_modo', "modo IN ('ventana_libre','agenda_compacta')")
@Check('chk_agenda_intervalo', 'intervalo_minutos IN (5,10,15,20,30,60)')
@Check('chk_agenda_anticipacion', 'anticipacion_minutos MOD 5 = 0')
export class ConfiguracionAgenda {
  @PrimaryColumn({ name: 'negocio_id', type: 'int', unsigned: true })
  negocioId: number;

  // La FK usa el mismo ID que la PK: no puede existir una segunda configuración.
  @ManyToOne(() => Negocio, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'negocio_id', referencedColumnName: 'id',
    foreignKeyConstraintName: 'fk_configuracion_agenda_negocio' })
  negocio: Negocio;

  @Column({ type: 'varchar', length: 20, default: 'ventana_libre' })
  modo: 'ventana_libre' | 'agenda_compacta';

  @Column({ name: 'intervalo_minutos', type: 'int', unsigned: true, default: 15 })
  intervaloMinutos: number;

  @Column({ name: 'anticipacion_minutos', type: 'int', unsigned: true, default: 15 })
  anticipacionMinutos: number;

  @Column({ name: 'dias_futuros', type: 'int', unsigned: true, default: 60 })
  diasFuturos: number;

  @CreateDateColumn({ name: 'creado_en', type: 'datetime', precision: 6 })
  creadoEn: Date;

  @UpdateDateColumn({ name: 'actualizado_en', type: 'datetime', precision: 6 })
  actualizadoEn: Date;
}
