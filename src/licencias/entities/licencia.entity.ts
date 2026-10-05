import {
  Column,
  Check,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Negocio } from '../../negocios/entities/negocio.entity';

/** Licencia siempre anual; su vencimiento se calcula, no se guarda como estado. */
@Entity({ name: 'licencias' })
@Index('uq_licencias_negocio_id', ['negocioId', 'id'], { unique: true })
@Index('idx_licencias_vencimiento', ['suspendidaEn', 'venceEn'])
@Check('chk_licencias_vigencia', '(habilitada_en IS NULL AND vence_en IS NULL) OR (habilitada_en IS NOT NULL AND vence_en IS NOT NULL AND vence_en > habilitada_en)')
@Check('chk_licencias_habilitacion', 'habilitada_en IS NULL OR habilitada_en >= creado_en')
@Check('chk_licencias_suspension', 'suspendida_en IS NULL OR (suspendida_en >= creado_en AND (habilitada_en IS NULL OR suspendida_en >= habilitada_en))')
export class Licencia {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @Column({ name: 'negocio_id', type: 'int', unsigned: true, unique: true })
  negocioId: number;

  @OneToOne(() => Negocio, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'negocio_id' })
  negocio: Negocio;

  // Habilitación y vencimiento permanecen nulos antes de activar al administrador.
  @Column({ name: 'habilitada_en', type: 'datetime', precision: 6, nullable: true })
  habilitadaEn: Date | null;

  @Column({ name: 'vence_en', type: 'datetime', precision: 6, nullable: true })
  venceEn: Date | null;

  @Column({ name: 'suspendida_en', type: 'datetime', precision: 6, nullable: true })
  suspendidaEn: Date | null;

  // La solicitud y el bloqueo previsto preservan las 48 horas de gracia.
  @Column({ name: 'suspension_solicitada_en', type: 'datetime', precision: 6, nullable: true })
  suspensionSolicitadaEn: Date | null;

  @Column({ name: 'bloqueo_programado_en', type: 'datetime', precision: 6, nullable: true })
  bloqueoProgramadoEn: Date | null;

  // congeladaEn marca el instante efectivo original; remanenteMs congela tiempo restante.
  @Column({ name: 'congelada_en', type: 'datetime', precision: 6, nullable: true })
  congeladaEn: Date | null;

  @Column({ name: 'remanente_ms', type: 'bigint', unsigned: true, nullable: true })
  remanenteMs: string | null;

  // Aumenta al cambiar venceEn para que consumidores puedan detectar su versión.
  @Column({ name: 'version_vencimiento', type: 'int', unsigned: true, default: 0 })
  versionVencimiento: number;

  @CreateDateColumn({ name: 'creado_en', type: 'datetime', precision: 6 })
  creadoEn: Date;

  @UpdateDateColumn({ name: 'actualizado_en', type: 'datetime', precision: 6 })
  actualizadoEn: Date;
}
