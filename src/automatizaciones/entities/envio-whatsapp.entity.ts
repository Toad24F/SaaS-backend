import { Check, Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type TipoEnvioWhatsapp = 'inicial_pendiente' | 'inicial_confirmada' | 'recordatorio';
export type EstadoEnvioWhatsapp = 'pendiente' | 'en_proceso' | 'aceptado' | 'entregado' | 'leido' | 'fallido' | 'incierto' | 'descartado';

/** Una fila es un efecto lógico; lease y reintento no crean otro envío. */
@Entity({ name: 'envios_whatsapp' })
@Index('uq_ew_negocio_id', ['negocioId', 'id'], { unique: true })
@Index('uq_ew_accion_referencia', ['negocioId', 'citaId', 'generacion', 'tipo', 'id'], { unique: true })
@Index('uq_ew_clave_efecto', ['negocioId', 'claveEfecto'], { unique: true })
@Index('uq_ew_generacion_tipo', ['negocioId', 'citaId', 'generacion', 'tipo'], { unique: true })
@Index('uq_ew_referencia_externa', ['negocioId', 'referenciaExterna'], { unique: true })
@Index('idx_ew_trabajo', ['estado', 'proximoIntentoEn', 'arrendadoHasta'])
@Index('idx_ew_cita', ['negocioId', 'citaId', 'generacion'])
@Check('chk_ew_clave', 'BINARY clave_efecto = BINARY TRIM(clave_efecto) AND CHAR_LENGTH(clave_efecto) > 0')
@Check('chk_ew_destino', "destino_e164 REGEXP '^[+][1-9][0-9]{6,14}$'")
@Check('chk_ew_utilidad', 'util_hasta > programado_en')
@Check('chk_ew_arrendamiento', "(estado='en_proceso' AND arrendamiento_id IS NOT NULL AND arrendado_hasta IS NOT NULL) OR (estado<>'en_proceso' AND arrendamiento_id IS NULL AND arrendado_hasta IS NULL)")
export class EnvioWhatsapp {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true }) id: string;
  @Column({ name: 'negocio_id', type: 'int', unsigned: true }) negocioId: number;
  @Column({ name: 'cita_id', type: 'int', unsigned: true }) citaId: number;
  @Column({ type: 'int', unsigned: true }) generacion: number;
  @Column({ type: 'enum', enum: ['inicial_pendiente', 'inicial_confirmada', 'recordatorio'] }) tipo: TipoEnvioWhatsapp;
  @Column({ name: 'clave_efecto', type: 'varchar', length: 160 }) claveEfecto: string;
  // Solo datos mínimos de la plantilla; las notas clínicas no pertenecen a la bandeja.
  @Column({ name: 'destino_e164', type: 'varchar', length: 16 }) destinoE164: string;
  @Column({ name: 'parametros_plantilla', type: 'json' }) parametrosPlantilla: Record<string, unknown>;
  @Column({ name: 'programado_en', type: 'datetime', precision: 3 }) programadoEn: Date;
  @Column({ name: 'util_hasta', type: 'datetime', precision: 3 }) utilHasta: Date;
  @Column({ type: 'enum', enum: ['pendiente', 'en_proceso', 'aceptado', 'entregado', 'leido', 'fallido', 'incierto', 'descartado'], default: 'pendiente' }) estado: EstadoEnvioWhatsapp;
  @Column({ type: 'int', unsigned: true, default: 0 }) intentos: number;
  @Column({ name: 'proximo_intento_en', type: 'datetime', precision: 3 }) proximoIntentoEn: Date;
  @Column({ name: 'arrendamiento_id', type: 'char', length: 36, charset: 'ascii', collation: 'ascii_bin', nullable: true }) arrendamientoId: string | null;
  @Column({ name: 'arrendado_hasta', type: 'datetime', precision: 3, nullable: true }) arrendadoHasta: Date | null;
  @Column({ name: 'referencia_externa', type: 'varchar', length: 128, nullable: true }) referenciaExterna: string | null;
  @Column({ name: 'aceptado_en', type: 'datetime', precision: 3, nullable: true }) aceptadoEn: Date | null;
  @Column({ name: 'entregado_en', type: 'datetime', precision: 3, nullable: true }) entregadoEn: Date | null;
  @Column({ name: 'leido_en', type: 'datetime', precision: 3, nullable: true }) leidoEn: Date | null;
  @Column({ name: 'ultimo_error', type: 'varchar', length: 255, nullable: true }) ultimoError: string | null;
  @CreateDateColumn({ name: 'creado_en', type: 'datetime', precision: 6 }) creadoEn: Date;
  @UpdateDateColumn({ name: 'actualizado_en', type: 'datetime', precision: 6 }) actualizadoEn: Date;
}
