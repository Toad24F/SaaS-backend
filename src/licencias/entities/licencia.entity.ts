import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Negocio } from '../../negocios/entities/negocio.entity';

/** Licencia siempre anual; su vencimiento se calcula, no se guarda como estado. */
@Entity({ name: 'licencias' })
export class Licencia {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @Column({ name: 'negocio_id', type: 'int', unsigned: true, unique: true })
  negocioId: number;

  @OneToOne(() => Negocio, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'negocio_id' })
  negocio: Negocio;

  // Habilitación y vencimiento permanecen nulos antes de activar al administrador.
  @Column({ name: 'habilitada_en', type: 'datetime', nullable: true })
  habilitadaEn: Date | null;

  @Column({ name: 'vence_en', type: 'datetime', nullable: true })
  venceEn: Date | null;

  @Column({ name: 'suspendida_en', type: 'datetime', nullable: true })
  suspendidaEn: Date | null;

  @CreateDateColumn({ name: 'creado_en', type: 'datetime', precision: 6 })
  creadoEn: Date;

  @UpdateDateColumn({ name: 'actualizado_en', type: 'datetime', precision: 6 })
  actualizadoEn: Date;
}
