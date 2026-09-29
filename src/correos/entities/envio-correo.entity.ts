import {
  Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne,
  PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { Negocio } from '../../negocios/entities/negocio.entity';
import { CodigoAcceso } from '../../codigos/entities/codigo-acceso.entity';
import { Licencia } from '../../licencias/entities/licencia.entity';

export enum TipoEnvioCorreo {
  ACTIVACION_ADMIN = 'activacion_admin',
  RECUPERACION = 'recuperacion',
  AVISO_VENCIMIENTO = 'aviso_vencimiento',
}

export enum EstadoEnvioCorreo {
  PENDIENTE = 'pendiente',
  TOMADO = 'tomado',
  ENVIADO = 'enviado',
  FALLIDO = 'fallido',
  DESCARTADO = 'descartado',
}

/** Bandeja durable: persiste la referencia, nunca el cuerpo ni el código entregable. */
@Entity({ name: 'envios_correo' })
@Index('uq_envios_clave_dedupe', ['claveDedupe'], { unique: true })
@Index('idx_envios_trabajo', ['estado', 'proximoIntentoEn', 'arrendadoHasta'])
@Index('idx_envios_codigo', ['negocioId', 'codigoAccesoId'])
@Index('idx_envios_licencia', ['negocioId', 'licenciaId'])
@Check('chk_envios_clave', 'BINARY clave_dedupe = BINARY TRIM(clave_dedupe) AND CHAR_LENGTH(clave_dedupe) > 0')
@Check('chk_envios_correo', 'BINARY correo_destinatario = BINARY LOWER(TRIM(correo_destinatario)) AND CHAR_LENGTH(correo_destinatario) > 0')
@Check('chk_envios_referencia', "(tipo IN ('activacion_admin','recuperacion') AND codigo_acceso_id IS NOT NULL AND licencia_id IS NULL AND version_vencimiento IS NULL) OR (tipo = 'aviso_vencimiento' AND codigo_acceso_id IS NULL AND licencia_id IS NOT NULL AND version_vencimiento >= 1)")
@Check('chk_envios_intentos', 'intentos >= 0')
@Check('chk_envios_arrendamiento', "(estado = 'tomado' AND arrendamiento_id IS NOT NULL AND arrendado_hasta IS NOT NULL) OR (estado <> 'tomado' AND arrendamiento_id IS NULL AND arrendado_hasta IS NULL)")
@Check('chk_envios_confirmacion', "(estado = 'enviado' AND confirmado_en IS NOT NULL) OR (estado <> 'enviado' AND confirmado_en IS NULL)")
export class EnvioCorreo {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ name: 'negocio_id', type: 'int', unsigned: true })
  negocioId: number;

  @ManyToOne(() => Negocio, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'negocio_id' })
  negocio: Negocio;

  @Column({ type: 'enum', enum: TipoEnvioCorreo })
  tipo: TipoEnvioCorreo;

  @Column({ name: 'correo_destinatario', type: 'varchar', length: 150 })
  correoDestinatario: string;

  // Esta clave identifica un envío lógico incluso después de reintentos o reinicios.
  @Column({ name: 'clave_dedupe', type: 'varchar', length: 160 })
  claveDedupe: string;

  // Los códigos se reconstruirán después del commit; el aviso usa la versión de vencimiento.
  @Column({ name: 'codigo_acceso_id', type: 'bigint', unsigned: true, nullable: true })
  codigoAccesoId: string | null;

  @ManyToOne(() => CodigoAcceso, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'negocio_id', referencedColumnName: 'negocioId' },
    { name: 'codigo_acceso_id', referencedColumnName: 'id' },
  ])
  codigoAcceso: CodigoAcceso | null;

  @Column({ name: 'licencia_id', type: 'int', unsigned: true, nullable: true })
  licenciaId: number | null;

  @ManyToOne(() => Licencia, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'negocio_id', referencedColumnName: 'negocioId' },
    { name: 'licencia_id', referencedColumnName: 'id' },
  ])
  licencia: Licencia | null;

  @Column({ name: 'version_vencimiento', type: 'int', unsigned: true, nullable: true })
  versionVencimiento: number | null;

  @Column({ type: 'enum', enum: EstadoEnvioCorreo, default: EstadoEnvioCorreo.PENDIENTE })
  estado: EstadoEnvioCorreo;

  @Column({ type: 'int', unsigned: true, default: 0 })
  intentos: number;

  @Column({ name: 'proximo_intento_en', type: 'datetime', precision: 6 })
  proximoIntentoEn: Date;

  // El token y el vencimiento permiten recuperar un trabajo tomado tras una caída.
  @Column({ name: 'arrendamiento_id', type: 'char', length: 36, nullable: true })
  arrendamientoId: string | null;

  @Column({ name: 'arrendado_hasta', type: 'datetime', precision: 6, nullable: true })
  arrendadoHasta: Date | null;

  @Column({ name: 'confirmado_en', type: 'datetime', precision: 6, nullable: true })
  confirmadoEn: Date | null;

  @Column({ name: 'ultimo_error', type: 'varchar', length: 255, nullable: true })
  ultimoError: string | null;

  @CreateDateColumn({ name: 'creado_en', type: 'datetime', precision: 6 })
  creadoEn: Date;

  @UpdateDateColumn({ name: 'actualizado_en', type: 'datetime', precision: 6 })
  actualizadoEn: Date;
}
