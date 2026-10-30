import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne,
  PrimaryGeneratedColumn } from 'typeorm';
import { Negocio } from '../../negocios/entities/negocio.entity';
import { Personal } from '../../profesionales/entities/personal.entity';
import { Servicio } from '../../servicios/entities/servicio.entity';
import { Sucursal } from '../../sucursales/entities/sucursal.entity';
import { Cliente } from './cliente.entity';

export type EstadoCita = 'pendiente' | 'confirmada' | 'completada' | 'cancelada' | 'no_asistio';
export type OrigenCita = 'portal_publico' | 'manual';

/** Compromiso con extremos UTC persistidos: la duración del catálogo no los recalcula. */
@Entity({ name: 'citas' })
@Index('uq_citas_negocio_id', ['negocioId', 'id'], { unique: true })
@Index('uq_citas_folio', ['folio'], { unique: true })
@Index('idx_citas_personal_inicio', ['negocioId', 'personalId', 'inicioUtc'])
@Index('idx_citas_sucursal_inicio', ['negocioId', 'sucursalId', 'inicioUtc'])
@Index('idx_citas_cliente', ['negocioId', 'clienteId'])
@Index('idx_citas_servicio', ['negocioId', 'servicioId'])
@Check('chk_citas_intervalo', 'fin_utc > inicio_utc')
@Check('chk_citas_zona', 'CHAR_LENGTH(TRIM(zona_horaria_reserva)) > 0')
@Check('chk_citas_costo_aceptado', 'costo_aceptado IS NULL OR costo_aceptado >= 0')
@Check('chk_citas_separacion', 'separacion_minutos BETWEEN 0 AND 60 AND separacion_minutos MOD 5 = 0')
@Check('chk_citas_fin_ocupacion', 'fin_ocupacion_utc IS NULL OR fin_ocupacion_utc = DATE_ADD(fin_utc, INTERVAL separacion_minutos MINUTE)')
export class Cita {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @Column({ name: 'negocio_id', type: 'int', unsigned: true })
  negocioId: number;

  @Column({ name: 'sucursal_id', type: 'int', unsigned: true })
  sucursalId: number;

  @Column({ name: 'personal_id', type: 'int', unsigned: true })
  personalId: number;

  @Column({ name: 'servicio_id', type: 'int', unsigned: true })
  servicioId: number;

  @Column({ name: 'cliente_id', type: 'int', unsigned: true })
  clienteId: number;

  // Las cinco FKs de recursos usan negocio_id junto al ID del destino.
  @ManyToOne(() => Negocio, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'negocio_id', referencedColumnName: 'id',
    foreignKeyConstraintName: 'fk_citas_negocio' })
  negocio: Negocio;

  @ManyToOne(() => Sucursal, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn([{ name: 'negocio_id', referencedColumnName: 'negocioId' },
    { name: 'sucursal_id', referencedColumnName: 'id' }])
  sucursal: Sucursal;

  @ManyToOne(() => Personal, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn([{ name: 'negocio_id', referencedColumnName: 'negocioId' },
    { name: 'personal_id', referencedColumnName: 'id' }])
  personal: Personal;

  @ManyToOne(() => Servicio, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn([{ name: 'negocio_id', referencedColumnName: 'negocioId' },
    { name: 'servicio_id', referencedColumnName: 'id' }])
  servicio: Servicio;

  @ManyToOne(() => Cliente, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn([{ name: 'negocio_id', referencedColumnName: 'negocioId' },
    { name: 'cliente_id', referencedColumnName: 'id' }])
  cliente: Cliente;

  @Column({ name: 'inicio_utc', type: 'datetime', precision: 3 })
  inicioUtc: Date;

  @Column({ name: 'fin_utc', type: 'datetime', precision: 3 })
  finUtc: Date;

  // finUtc sigue siendo el fin de atención; el margen protegido se guarda aparte.
  // NULL permite al escritor anterior convivir hasta que el nuevo motor lo sustituya.
  @Column({ name: 'fin_ocupacion_utc', type: 'datetime', precision: 3, nullable: true })
  finOcupacionUtc: Date | null;

  @Column({ name: 'separacion_minutos', type: 'int', unsigned: true, default: 0 })
  separacionMinutos: number;

  @Column({ name: 'zona_horaria_reserva', type: 'varchar', length: 64 })
  zonaHorariaReserva: string;

  @Column({ type: 'enum', enum: ['pendiente', 'confirmada', 'completada',
    'cancelada', 'no_asistio'], default: 'pendiente' })
  estado: EstadoCita;

  @Column({ name: 'motivo_consulta', type: 'text', nullable: true })
  motivoConsulta: string | null;

  // La cita conserva el precio y el resumen tal como se aceptaron al registrarla.
  // Las filas anteriores mantienen NULL; no se reconstruyen desde el catálogo actual.
  @Column({ name: 'costo_aceptado', type: 'decimal', precision: 10, scale: 2,
    nullable: true })
  costoAceptado: string | null;

  @Column({ name: 'nombre_contacto', type: 'varchar', length: 150, nullable: true })
  nombreContacto: string | null;

  @Column({ name: 'telefono_contacto', type: 'varchar', length: 10, nullable: true })
  telefonoContacto: string | null;

  @Column({ name: 'nombre_negocio', type: 'varchar', length: 150, nullable: true })
  nombreNegocio: string | null;

  @Column({ name: 'nombre_servicio', type: 'varchar', length: 150, nullable: true })
  nombreServicio: string | null;

  @Column({ name: 'nombre_sucursal', type: 'varchar', length: 150, nullable: true })
  nombreSucursal: string | null;

  @Column({ name: 'nombre_profesional', type: 'varchar', length: 150, nullable: true })
  nombreProfesional: string | null;

  @Column({ type: 'varchar', length: 20 })
  folio: string;

  @Column({ type: 'enum', enum: ['portal_publico', 'manual'], default: 'portal_publico' })
  origen: OrigenCita;

  @CreateDateColumn({ name: 'creado_en', type: 'datetime', precision: 6 })
  creadoEn: Date;
}
