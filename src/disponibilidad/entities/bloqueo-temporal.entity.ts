import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne,
  PrimaryGeneratedColumn } from 'typeorm';
import { Negocio } from '../../negocios/entities/negocio.entity';
import { Personal } from '../../profesionales/entities/personal.entity';
import { Sucursal } from '../../sucursales/entities/sucursal.entity';
import { Servicio } from '../../servicios/entities/servicio.entity';

/** Apartado temporal con intervalo UTC y titular almacenado solo como hash. */
@Entity({ name: 'bloqueos_temporales' })
@Index('uq_bt_negocio_id', ['negocioId', 'id'], { unique: true })
@Index('idx_bt_personal_inicio', ['negocioId', 'personalId', 'inicioUtc'])
@Index('idx_bt_personal_expira', ['negocioId', 'personalId', 'expiraEn'])
@Index('idx_bt_sucursal', ['negocioId', 'sucursalId'])
@Index('idx_bt_servicio', ['negocioId', 'servicioId'])
@Check('chk_bt_intervalo', 'fin_utc > inicio_utc')
@Check('chk_bt_hash', 'CHAR_LENGTH(titular_hash) = 64')
export class BloqueoTemporal {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @Column({ name: 'negocio_id', type: 'int', unsigned: true })
  negocioId: number;

  @Column({ name: 'personal_id', type: 'int', unsigned: true })
  personalId: number;

  @Column({ name: 'sucursal_id', type: 'int', unsigned: true })
  sucursalId: number;

  @Column({ name: 'servicio_id', type: 'int', unsigned: true })
  servicioId: number;

  // Las relaciones compuestas mantienen todas las referencias en el mismo negocio.
  @ManyToOne(() => Negocio, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'negocio_id', referencedColumnName: 'id',
    foreignKeyConstraintName: 'fk_bt_negocio' })
  negocio: Negocio;

  @ManyToOne(() => Personal, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn([{ name: 'negocio_id', referencedColumnName: 'negocioId' },
    { name: 'personal_id', referencedColumnName: 'id' }])
  personal: Personal;

  @ManyToOne(() => Sucursal, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn([{ name: 'negocio_id', referencedColumnName: 'negocioId' },
    { name: 'sucursal_id', referencedColumnName: 'id' }])
  sucursal: Sucursal;

  @ManyToOne(() => Servicio, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn([{ name: 'negocio_id', referencedColumnName: 'negocioId' },
    { name: 'servicio_id', referencedColumnName: 'id' }])
  servicio: Servicio;

  @Column({ name: 'inicio_utc', type: 'datetime', precision: 3 })
  inicioUtc: Date;

  @Column({ name: 'fin_utc', type: 'datetime', precision: 3 })
  finUtc: Date;

  @Column({ name: 'expira_en', type: 'datetime', precision: 3 })
  expiraEn: Date;

  // La liberación explícita y el vencimiento se evaluarán al consultar; no borran la fila.
  @Column({ name: 'liberado_en', type: 'datetime', precision: 3, nullable: true })
  liberadoEn: Date | null;

  @Column({ name: 'titular_hash', type: 'char', length: 64 })
  titularHash: string;

  @CreateDateColumn({ name: 'creado_en', type: 'datetime', precision: 6 })
  creadoEn: Date;
}
