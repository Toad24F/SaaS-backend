import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne,
  PrimaryGeneratedColumn } from 'typeorm';
import { Negocio } from '../../negocios/entities/negocio.entity';
import { Personal } from '../../profesionales/entities/personal.entity';
import { Sucursal } from '../../sucursales/entities/sucursal.entity';
import { Servicio } from '../../servicios/entities/servicio.entity';
import { SesionReservaPublica } from '../../reservas-publicas/entities/sesion-reserva-publica.entity';
import { OperacionApartado } from '../../reservas-publicas/entities/operacion-apartado.entity';
import { IntentoReservaPublica } from '../../reservas-publicas/entities/intento-reserva-publica.entity';

/** Apartado temporal con intervalo UTC y titular almacenado solo como hash. */
@Entity({ name: 'bloqueos_temporales' })
@Index('uq_bt_negocio_id', ['negocioId', 'id'], { unique: true })
@Index('idx_bt_personal_inicio', ['negocioId', 'personalId', 'inicioUtc'])
@Index('idx_bt_personal_expira', ['negocioId', 'personalId', 'expiraEn'])
@Index('idx_bt_sucursal', ['negocioId', 'sucursalId'])
@Index('idx_bt_servicio', ['negocioId', 'servicioId'])
@Index('idx_bt_sesion', ['negocioId', 'sesionId'])
@Index('idx_bt_operacion', ['negocioId', 'operacionId'])
@Index('idx_bt_intento_actual', ['negocioId', 'intentoActualId'])
@Check('chk_bt_intervalo', 'fin_utc > inicio_utc')
@Check('chk_bt_hash', 'CHAR_LENGTH(titular_hash) = 64')
@Check('chk_bt_costo_aceptado', 'costo_aceptado IS NULL OR costo_aceptado >= 0')
@Check('chk_bt_contexto_protegido', `COALESCE((
  (fin_ocupacion_utc IS NULL AND separacion_minutos IS NULL
    AND modo_concesion IS NULL AND version_reglas IS NULL)
  OR (fin_ocupacion_utc IS NOT NULL AND separacion_minutos IS NOT NULL
    AND modo_concesion IS NOT NULL AND version_reglas IS NOT NULL
    AND separacion_minutos BETWEEN 0 AND 60 AND separacion_minutos MOD 5 = 0
    AND modo_concesion IN ('ventana_libre','agenda_compacta') AND version_reglas >= 1)
), 0)`)
@Check('chk_bt_fin_ocupacion', 'fin_ocupacion_utc IS NULL OR fin_ocupacion_utc = DATE_ADD(fin_utc, INTERVAL separacion_minutos MINUTE)')
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

  // Las condiciones de concesión anteriores son desconocidas y siguen nulas.
  // El escritor nuevo capturará juntas separación, fin protegido, modo y versión.
  @Column({ name: 'fin_ocupacion_utc', type: 'datetime', precision: 3, nullable: true })
  finOcupacionUtc: Date | null;

  @Column({ name: 'separacion_minutos', type: 'int', unsigned: true, nullable: true })
  separacionMinutos: number | null;

  @Column({ name: 'modo_concesion', type: 'varchar', length: 20, nullable: true })
  modoConcesion: 'ventana_libre' | 'agenda_compacta' | null;

  @Column({ name: 'version_reglas', type: 'int', unsigned: true, nullable: true })
  versionReglas: number | null;

  @Column({ name: 'expira_en', type: 'datetime', precision: 3 })
  expiraEn: Date;

  // La liberación explícita y el vencimiento se evaluarán al consultar; no borran la fila.
  @Column({ name: 'liberado_en', type: 'datetime', precision: 3, nullable: true })
  liberadoEn: Date | null;

  @Column({ name: 'titular_hash', type: 'char', length: 64 })
  titularHash: string;

  // Los apartados anteriores carecen de precio y contexto público; no se inventan.
  @Column({ name: 'costo_aceptado', type: 'decimal', precision: 10, scale: 2,
    nullable: true })
  costoAceptado: string | null;

  @Column({ name: 'zona_horaria_apartado', type: 'varchar', length: 64,
    nullable: true })
  zonaHorariaApartado: string | null;

  @Column({ name: 'sesion_id', type: 'int', unsigned: true, nullable: true })
  sesionId: number | null;

  @ManyToOne(() => SesionReservaPublica, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn([{ name: 'negocio_id', referencedColumnName: 'negocioId',
    foreignKeyConstraintName: 'fk_bt_sesion' },
  { name: 'sesion_id', referencedColumnName: 'id' }])
  sesion: SesionReservaPublica | null;

  @Column({ type: 'bigint', unsigned: true, nullable: true })
  generacion: string | null;

  @Column({ name: 'operacion_id', type: 'bigint', unsigned: true, nullable: true })
  operacionId: string | null;

  @ManyToOne(() => OperacionApartado, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn([{ name: 'negocio_id', referencedColumnName: 'negocioId',
    foreignKeyConstraintName: 'fk_bt_operacion' },
  { name: 'operacion_id', referencedColumnName: 'id' }])
  operacion: OperacionApartado | null;

  // El puntero cambia solo bajo la exclusión del apartado; la FK impide otro negocio.
  @Column({ name: 'intento_actual_id', type: 'bigint', unsigned: true, nullable: true })
  intentoActualId: string | null;

  @ManyToOne(() => IntentoReservaPublica, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn([{ name: 'negocio_id', referencedColumnName: 'negocioId',
    foreignKeyConstraintName: 'fk_bt_intento_actual' },
  { name: 'intento_actual_id', referencedColumnName: 'id' }])
  intentoActual: IntentoReservaPublica | null;

  @CreateDateColumn({ name: 'creado_en', type: 'datetime', precision: 6 })
  creadoEn: Date;
}
